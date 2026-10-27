#!/usr/bin/env python3
"""Offline regression tests for safe Cursor delegation stream handling."""
from __future__ import annotations

import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unittest

REPO_ROOT = Path(__file__).resolve().parents[1]
MONITOR = REPO_ROOT / "scripts" / "delegate-cursor-monitor.py"
DELEGATE = REPO_ROOT / "scripts" / "delegate-cursor.sh"


class DelegateCursorMonitorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="price-memo-delegate-test-")
        self.root = Path(self.temp.name)
        self.checkout = self.root / "checkout"
        self.checkout.mkdir()
        self.state_home = self.root / "state"
        self.state_home.mkdir(mode=0o700)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def fake_agent(self, source: str, name: str = "fake-agent.py") -> Path:
        path = self.root / name
        path.write_text(source, encoding="utf-8")
        return path

    def monitor_command(self, agent: Path, *, route: str = "cursor", tier: str = "light",
                        model: str = "composer-2.5", workspace_mode: bool = False) -> list[str]:
        command = [sys.executable, str(MONITOR), "--checkout", str(self.checkout),
                   "--route", route, "--tier", tier, "--model", model]
        if workspace_mode:
            command.append("--workspace-mode")
        return [*command, "--", sys.executable, str(agent)]

    def env(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        result = os.environ.copy()
        result["XDG_STATE_HOME"] = str(self.state_home)
        if extra:
            result.update(extra)
        return result

    def run_agent(self, agent: Path, *, extra: tuple[str, ...] = (),
                  env_extra: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            self.monitor_command(agent, *extra), cwd=REPO_ROOT, env=self.env(env_extra),
            capture_output=True, text=True, check=False, timeout=15,
        )

    def failure_dir(self) -> Path:
        return self.state_home / "price-memo" / "delegate-cursor"

    def failure_records(self) -> list[Path]:
        if not self.failure_dir().exists():
            return []
        return sorted(self.failure_dir().glob("safe-failure-*.json"))

    def test_success_prints_allowlisted_progress_and_bounded_sanitized_report(self) -> None:
        report = "\n".join([
            "1. root cause / implementation intent", "intent retained",
            "2. changed files", "scripts/delegate-cursor-monitor.py",
            "3. verification performed and results", "checks passed",
            "4. remaining risks", "DELEGATE_TEST_API_KEY_SENTINEL",
            "5. supervisor decisions required", "Authorization: Bearer REPORT_BEARER_SENTINEL",
        ])
        source = (
            "import json,sys\n"
            "emit=lambda obj: print(json.dumps(obj), flush=True)\n"
            "emit({'type':'system','subtype':'init','session_id':'SESSION_SENTINEL','secret':'EVENT_SECRET_SENTINEL'})\n"
            "emit({'type':'assistant','message':'PROMPT_SENTINEL'})\n"
            "emit({'type':'tool_call','subtype':'started','tool_call':{'shellToolCall':{'args':{'command':'TOOL_ARG_SENTINEL'}}}})\n"
            "emit({'type':'tool_call','subtype':'completed','tool_call':{'shellToolCall':{'result':{'stdout':'TOOL_RESULT_SENTINEL'}}}})\n"
            f"emit({{'type':'result','subtype':'success','is_error':False,'result':{report!r}}})\n"
            "print('STDERR_SENTINEL', file=sys.stderr, flush=True)\n"
        )
        agent = self.fake_agent(source)
        result = self.run_agent(agent, env_extra={"DELEGATE_TEST_API_KEY": "DELEGATE_TEST_API_KEY_SENTINEL"})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("tool: Shellコマンド started", result.stdout)
        self.assertIn("tool: Shellコマンド completed", result.stdout)
        self.assertIn("intent retained", result.stdout)
        self.assertIn("scripts/delegate-cursor-monitor.py", result.stdout)
        persisted = result.stdout + result.stderr
        for secret in (
            "SESSION_SENTINEL", "EVENT_SECRET_SENTINEL", "PROMPT_SENTINEL",
            "TOOL_ARG_SENTINEL", "TOOL_RESULT_SENTINEL", "STDERR_SENTINEL",
            "DELEGATE_TEST_API_KEY_SENTINEL", "REPORT_BEARER_SENTINEL",
        ):
            self.assertNotIn(secret, persisted)
        self.assertLessEqual(len(result.stdout.encode()), 5000)
        self.assertEqual(self.failure_records(), [])

    def test_failure_saves_only_restricted_allowlisted_metadata(self) -> None:
        source = (
            "import json,sys\n"
            "print('MALFORMED_STDOUT_SENTINEL', flush=True)\n"
            "print('resource_exhausted token=STDERR_SECRET_SENTINEL', file=sys.stderr, flush=True)\n"
            "print('network connection error Authorization: Bearer NET_SECRET_SENTINEL', file=sys.stderr, flush=True)\n"
            "print(json.dumps({'type':'result','subtype':'error','is_error':True,'result':'password=REPORT_SECRET_SENTINEL'}), flush=True)\n"
            "raise SystemExit(1)\n"
        )
        agent = self.fake_agent(source)
        result = self.run_agent(agent, env_extra={"DELEGATE_TEST_PASSWORD": "REPORT_SECRET_SENTINEL"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outcome: cursor_agent_unclassified", result.stdout)
        self.assertIn("resource_exhausted", result.stdout)
        self.assertIn("network_connection", result.stdout)
        for secret in ("MALFORMED_STDOUT_SENTINEL", "STDERR_SECRET_SENTINEL", "NET_SECRET_SENTINEL", "REPORT_SECRET_SENTINEL"):
            self.assertNotIn(secret, result.stdout + result.stderr)
        records = self.failure_records()
        self.assertEqual(len(records), 1)
        payload = records[0].read_bytes()
        self.assertLessEqual(len(payload), 8192)
        data = json.loads(payload)
        self.assertEqual(data["outcome"], "cursor_agent_unclassified")
        self.assertEqual(data["stderr_categories"]["resource_exhausted"], 1)
        self.assertEqual(data["stderr_categories"]["network_connection"], 1)
        self.assertNotIn("result", data)
        self.assertNotIn("stderr_excerpt", data)
        for secret in (b"MALFORMED_STDOUT_SENTINEL", b"STDERR_SECRET_SENTINEL", b"REPORT_SECRET_SENTINEL"):
            self.assertNotIn(secret, payload)
        self.assertEqual(stat.S_IMODE(self.failure_dir().stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(records[0].stat().st_mode), 0o600)

    def test_missing_result_and_invalid_json_are_failures(self) -> None:
        for index, source in enumerate((
            "print('plain output contains NO_RAW_OUTPUT_SENTINEL', flush=True)\n",
            "import json\nprint('{not valid JSON SECRET_INVALID_SENTINEL', flush=True)\n",
        )):
            with self.subTest(index=index):
                agent = self.fake_agent(source, f"malformed-{index}.py")
                result = self.run_agent(agent)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("result_event_status: missing", result.stdout)
                self.assertNotIn("NO_RAW_OUTPUT_SENTINEL", result.stdout)
                self.assertNotIn("SECRET_INVALID_SENTINEL", result.stdout)
                self.assertEqual(len(self.failure_records()), 1)
                for path in self.failure_records():
                    path.unlink()

    def test_oversized_stream_line_is_discarded_without_unbounded_output(self) -> None:
        source = (
            "import json\n"
            "print('X' * (300 * 1024) + 'LONG_STREAM_SECRET_SENTINEL', flush=True)\n"
            "print(json.dumps({'type':'result','subtype':'success','is_error':False}), flush=True)\n"
        )
        result = self.run_agent(self.fake_agent(source))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("oversized_stream_lines: 1", result.stdout)
        self.assertNotIn("LONG_STREAM_SECRET_SENTINEL", result.stdout)
        self.assertLessEqual(len(result.stdout.encode()), 5000)

    def test_oversized_completion_report_is_truncated(self) -> None:
        source = (
            "import json\n"
            "print(json.dumps({'type':'result','subtype':'success','is_error':False,'result':'R' * (100 * 1024)}),flush=True)\n"
        )
        result = self.run_agent(self.fake_agent(source))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("[delegate-cursor] report: [truncated]", result.stdout)
        self.assertLessEqual(len(result.stdout.encode()), 5000)

    def test_failure_retention_prunes_only_own_regular_records(self) -> None:
        agent = self.fake_agent("raise SystemExit(7)\n")
        result = self.run_agent(agent)
        self.assertEqual(result.returncode, 7)
        directory = self.failure_dir()
        old = directory / "safe-failure-20200101T000000Z-aaaaaaaaaaaa.json"
        old.write_text("old metadata", encoding="utf-8")
        old_time = time.time() - 8 * 24 * 60 * 60
        os.utime(old, (old_time, old_time))
        for index in range(22):
            path = directory / f"safe-failure-20260101T0000{index:02d}Z-{index:012x}.json"
            path.write_text("{}", encoding="utf-8")
        unrelated = directory / "cursor-stderr-legacy.log"
        unrelated.write_text("legacy file must remain", encoding="utf-8")
        outside = self.root / "outside-marker"
        outside.write_text("untouched", encoding="utf-8")
        link = directory / "safe-failure-20260102T000000Z-bbbbbbbbbbbb.json"
        link.symlink_to(outside)
        result = self.run_agent(agent)
        self.assertEqual(result.returncode, 7)
        self.assertFalse(old.exists())
        self.assertTrue(link.is_symlink())
        self.assertEqual(outside.read_text(encoding="utf-8"), "untouched")
        self.assertEqual(unrelated.read_text(encoding="utf-8"), "legacy file must remain")
        self.assertLessEqual(len(self.failure_records()), 20)
        self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)

    def test_symlink_state_directory_fails_closed(self) -> None:
        app_dir = self.state_home / "price-memo"
        app_dir.mkdir(mode=0o700)
        outside = self.root / "outside-state"
        outside.mkdir(mode=0o700)
        (app_dir / "delegate-cursor").symlink_to(outside, target_is_directory=True)
        result = self.run_agent(self.fake_agent("raise SystemExit(2)\n"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("metadata not saved", result.stdout)
        self.assertEqual(list(outside.iterdir()), [])

    def test_sigint_and_sigterm_are_forwarded_to_only_the_child_group(self) -> None:
        agent = self.fake_agent("import time\ntime.sleep(30)\n")
        for sig, expected in ((signal.SIGINT, 128 + signal.SIGINT), (signal.SIGTERM, 128 + signal.SIGTERM)):
            with self.subTest(signal=sig):
                proc = subprocess.Popen(
                    self.monitor_command(agent), cwd=REPO_ROOT, env=self.env(),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
                )
                assert proc.stdout is not None
                proc.stdout.readline()
                proc.stdout.readline()
                proc.stdout.readline()
                proc.send_signal(sig)
                out, err = proc.communicate(timeout=8)
                self.assertEqual(proc.returncode, expected, out + err)
                self.assertIn("outcome: interrupted", out)
                self.assertNotIn("sleep(30)", out + err)

    def test_all_model_routes_and_allow_dirty_gate_are_preserved(self) -> None:
        fixture = self.root / "repo"
        (fixture / "scripts").mkdir(parents=True)
        (fixture / "scripts/delegate-cursor.sh").write_bytes(DELEGATE.read_bytes())
        (fixture / "scripts/delegate-cursor-monitor.py").write_bytes(MONITOR.read_bytes())
        (fixture / "scripts/delegate-cursor.sh").chmod(0o755)
        (fixture / "scripts/delegate-cursor-monitor.py").chmod(0o755)
        subprocess.run(["git", "init", "-b", "main", str(fixture)], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(fixture), "config", "user.name", "Test"], check=True)
        subprocess.run(["git", "-C", str(fixture), "config", "user.email", "test@example.invalid"], check=True)
        (fixture / "tracked.txt").write_text("clean\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(fixture), "add", "."], check=True)
        subprocess.run(["git", "-C", str(fixture), "commit", "-m", "fixture"], check=True, capture_output=True)
        (fixture / "tracked.txt").write_text("dirty\n", encoding="utf-8")
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        args_file = self.root / "agent-args.json"
        agent = fake_bin / "agent"
        agent.write_text(
            "#!/usr/bin/env python3\nimport json,os,sys\n"
            "open(os.environ['FAKE_AGENT_ARGS'],'w').write(json.dumps(sys.argv[1:]))\n"
            "print(json.dumps({'type':'result','subtype':'success','is_error':False}),flush=True)\n",
            encoding="utf-8",
        )
        agent.chmod(0o755)
        env = self.env({"PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}", "FAKE_AGENT_ARGS": str(args_file)})
        refused = subprocess.run([str(fixture / "scripts/delegate-cursor.sh"), "--prompt", "PROMPT_ARG_SENTINEL"], cwd=fixture, env=env, capture_output=True, text=True)
        self.assertEqual(refused.returncode, 3)
        self.assertFalse(args_file.exists())
        routes = [
            ((), "cursor", "light", "composer-2.5"),
            (("--tier", "normal"), "cursor", "normal", "grok-4.7-medium"),
            (("--tier", "hard"), "cursor", "hard", "grok-4.7-high"),
            (("--fallback-tier", "light"), "other-models", "fallback-light", "gemini-3.8-flash-low"),
            (("--fallback-tier", "normal"), "other-models", "fallback-normal", "claude-sonnet-5-5-medium"),
            (("--model-override", "gpt-5.6-luna-medium"), "other-models-reserve", "model-override", "gpt-5.6-luna-medium"),
        ]
        for options, route, tier, model in routes:
            with self.subTest(model=model):
                result = subprocess.run(
                    [str(fixture / "scripts/delegate-cursor.sh"), "--allow-dirty", *options,
                     "--prompt", "PROMPT_ARG_SENTINEL"], cwd=fixture, env=env,
                    capture_output=True, text=True, timeout=10,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                args = json.loads(args_file.read_text(encoding="utf-8"))
                self.assertIn("--approve-mcps", args)
                self.assertIn("--trust", args)
                self.assertEqual(args[args.index("--model") + 1], model)
                self.assertNotIn("PROMPT_ARG_SENTINEL", result.stdout + result.stderr)
                self.assertIn(f"route: {route}", result.stdout)
                self.assertIn(f"tier/model: {tier}/{model}", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
