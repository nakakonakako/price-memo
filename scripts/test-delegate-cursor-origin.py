#!/usr/bin/env python3
"""Fixture tests for separating the worker workspace from its harness source."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DelegateCursorOriginTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="price-delegate-origin-")
        self.root = Path(self.temp.name)
        self.main_origin = self.root / "price-memo"
        (self.main_origin / "scripts").mkdir(parents=True)
        for name in ("delegate-cursor.sh", "delegate-cursor-monitor.py"):
            source = ROOT / "scripts" / name
            target = self.main_origin / "scripts" / name
            target.write_bytes(source.read_bytes())
            target.chmod(0o755)

        worktree_script = self.main_origin / "scripts/worktree.sh"
        worktree_script.write_text(
            "#!/usr/bin/env bash\n"
            "set -eu\n"
            "printf '%s\\n' \"$*\" >> \"$WORKTREE_LOG\"\n"
            "case \"$1\" in\n"
            "  create)\n"
            "    task=\"$2\"; shift 2; branch=''\n"
            "    while [[ $# -gt 0 ]]; do\n"
            "      if [[ \"$1\" == --branch ]]; then branch=\"$2\"; shift 2; else shift 2; fi\n"
            "    done\n"
            "    target=\"$HOME/worktrees/price-memo/$task\"\n"
            "    if [[ ! -e \"$target\" ]]; then\n"
            "      mkdir -p \"$(dirname \"$target\")\"\n"
            "      git -C \"$ORIGIN_ROOT\" worktree add -b \"$branch\" \"$target\" HEAD >/dev/null\n"
            "    fi\n"
            "    ;;\n"
            "  reuse) ;;\n"
            "  validate-env) [[ \"${VALIDATE_FAIL:-0}\" != 1 ]] || exit 19 ;;\n"
            "  *) exit 90 ;;\n"
            "esac\n",
            encoding="utf-8",
        )
        worktree_script.chmod(0o755)

        subprocess.run(["git", "init", "-b", "main", str(self.main_origin)], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.main_origin), "config", "user.name", "Fixture"], check=True)
        subprocess.run(
            ["git", "-C", str(self.main_origin), "config", "user.email", "fixture@example.invalid"],
            check=True,
        )
        (self.main_origin / "fixture.txt").write_text("base\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.main_origin), "add", "."], check=True)
        subprocess.run(
            ["git", "-C", str(self.main_origin), "commit", "-m", "fixture"],
            check=True,
            capture_output=True,
        )

        self.feature_origin = self.root / "feature-origin"
        subprocess.run(
            ["git", "-C", str(self.main_origin), "worktree", "add", "-b", "supervisor-topic", str(self.feature_origin)],
            check=True,
            capture_output=True,
        )
        feature_monitor = self.feature_origin / "scripts/delegate-cursor-monitor.py"
        monitor_source = feature_monitor.read_text(encoding="utf-8")
        future = "from __future__ import annotations\n"
        self.assertIn(future, monitor_source)
        feature_monitor.write_text(
            monitor_source.replace(
                future,
                future
                + "import os\n"
                + "Path = __import__('pathlib').Path\n"
                + "Path(os.environ['ORIGIN_MONITOR_MARKER']).write_text('origin monitor ran')\n",
                1,
            ),
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(self.feature_origin), "add", "scripts/delegate-cursor-monitor.py"], check=True)
        subprocess.run(
            ["git", "-C", str(self.feature_origin), "commit", "-m", "feature monitor marker"],
            check=True,
            capture_output=True,
        )

        self.fake_bin = self.root / "bin"
        self.fake_bin.mkdir()
        python_logger = self.fake_bin / "python3"
        python_logger.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "with open(os.environ['MONITOR_CALL_LOG'], 'a', encoding='utf-8') as f:\n"
            " f.write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "os.execv(os.environ['REAL_PYTHON'], [os.environ['REAL_PYTHON'], *sys.argv[1:]])\n",
            encoding="utf-8",
        )
        python_logger.chmod(0o755)
        fake_agent = self.fake_bin / "agent"
        fake_agent.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys, time\n"
            "record = {'argv': sys.argv[1:], 'cwd': os.getcwd()}\n"
            "with open(os.environ['WORKER_CALL_LOG'], 'a', encoding='utf-8') as f:\n"
            " f.write(json.dumps(record) + '\\n')\n"
            "open(os.environ['WORKER_MARKER'], 'w').write('started')\n"
            "mode = os.environ.get('MOCK_WORKER_MODE', 'success')\n"
            "if mode == 'hold': time.sleep(30)\n"
            "if mode == 'fail':\n"
            " print(json.dumps({'type':'result','subtype':'error','is_error':True,'result':'VERIFICATION RESULTS\\nCOVERAGE: INCOMPLETE\\nFAIL: mock criterion — observed failure\\nEND VERIFICATION RESULTS'}), flush=True)\n"
            " raise SystemExit(1)\n"
            "print(json.dumps({'type':'system','subtype':'init','session_id':'fixture-session'}), flush=True)\n"
            "print(json.dumps({'type':'result','subtype':'success','is_error':False}), flush=True)\n",
            encoding="utf-8",
        )
        fake_agent.chmod(0o755)

        self.home = self.root / "home"
        self.home.mkdir()
        self.state_home = self.root / "state"
        self.state_home.mkdir(mode=0o700)
        self.worker_call_log = self.root / "worker-calls.jsonl"
        self.worker_marker = self.root / "worker-started"
        self.monitor_call_log = self.root / "monitor-calls.jsonl"
        self.worktree_log = self.root / "worktree-calls.log"
        self.workspace_monitor_marker = self.root / "workspace-monitor-ran"
        self.origin_monitor_marker = self.root / "origin-monitor-ran"
        self.env = {
            **os.environ,
            "PATH": f"{self.fake_bin}{os.pathsep}{os.environ['PATH']}",
            "HOME": str(self.home),
            "XDG_STATE_HOME": str(self.state_home),
            "REAL_PYTHON": sys.executable,
            "MONITOR_CALL_LOG": str(self.monitor_call_log),
            "WORKER_CALL_LOG": str(self.worker_call_log),
            "WORKER_MARKER": str(self.worker_marker),
            "WORKTREE_LOG": str(self.worktree_log),
            "WORKSPACE_MONITOR_MARKER": str(self.workspace_monitor_marker),
            "ORIGIN_MONITOR_MARKER": str(self.origin_monitor_marker),
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def delegate(
        self,
        origin: Path,
        *args: str,
        env_extra: dict[str, str] | None = None,
        timeout: int = 15,
    ) -> subprocess.CompletedProcess[str]:
        env = {**self.env, "ORIGIN_ROOT": str(origin)}
        if env_extra:
            env.update(env_extra)
        return subprocess.run(
            [str(origin / "scripts/delegate-cursor.sh"), *args],
            cwd=origin,
            env=env,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )

    def call_records(self, path: Path) -> list[dict[str, object]]:
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def latest_monitor_args(self) -> list[str]:
        records = self.call_records(self.monitor_call_log)
        return records[-1]

    def latest_worker(self) -> dict[str, object]:
        return self.call_records(self.worker_call_log)[-1]

    def assert_monitor_contract(
        self,
        origin: Path,
        workspace: Path,
        *,
        workspace_mode: bool,
        tier: str = "light",
        model: str = "composer-2.5",
    ) -> None:
        args = self.latest_monitor_args()
        self.assertEqual(Path(args[0]), origin / "scripts/delegate-cursor-monitor.py")
        self.assertEqual(args[args.index("--checkout") + 1], str(workspace.resolve()))
        self.assertEqual("--workspace-mode" in args, workspace_mode)
        self.assertEqual(args[args.index("--route") + 1], "cursor")
        self.assertEqual(args[args.index("--tier") + 1], tier)
        self.assertEqual(args[args.index("--model") + 1], model)
        key = hashlib.sha256(os.fsencode(str(workspace.resolve()))).hexdigest()
        state_dir = self.state_home / "price-memo/delegate-cursor"
        self.assertTrue((state_dir / f"workspace-lock-{key}.lock").exists())

    def tamper_workspace_harness(self, workspace: Path) -> None:
        (workspace / "scripts/delegate-cursor-monitor.py").write_text(
            "from pathlib import Path\n"
            "import os\n"
            "Path(os.environ['WORKSPACE_MONITOR_MARKER']).write_text('wrong monitor ran')\n"
            "raise SystemExit(91)\n",
            encoding="utf-8",
        )
        (workspace / "scripts/worktree.sh").write_text(
            "#!/usr/bin/env bash\n"
            "touch \"$WORKSPACE_MONITOR_MARKER\"\n"
            "exit 92\n",
            encoding="utf-8",
        )
        (workspace / "scripts/worktree.sh").chmod(0o755)

    def test_direct_checkout_uses_same_canonical_path_for_origin_and_worker(self) -> None:
        result = self.delegate(
            self.main_origin, "--allow-dirty", "--tier", "hard", "--prompt", "direct fixture"
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_monitor_contract(
            self.main_origin,
            self.main_origin,
            workspace_mode=False,
            tier="hard",
            model="grok-4.7-high",
        )
        worker = self.latest_worker()
        self.assertEqual(worker["cwd"], str(self.main_origin.resolve()))
        self.assertNotIn("--workspace", worker["argv"])
        self.assertIn("--model", worker["argv"])
        self.assertEqual(worker["argv"][worker["argv"].index("--model") + 1], "grok-4.7-high")

    def test_symlinked_invocation_path_is_normalized_for_harness_and_checkout(self) -> None:
        alias = self.root / "main-origin-alias"
        alias.symlink_to(self.main_origin, target_is_directory=True)
        result = self.delegate(alias, "--allow-dirty", "--prompt", "canonical path")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_monitor_contract(self.main_origin, self.main_origin, workspace_mode=False)
        self.assertEqual(self.latest_worker()["cwd"], str(self.main_origin.resolve()))

    def test_non_main_origin_creates_and_reuses_target_using_origin_harness_only(self) -> None:
        result = self.delegate(self.feature_origin, "--worktree", "worker-task", "--prompt", "fixture")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        workspace = self.home / "worktrees/price-memo/worker-task"
        self.assertTrue(self.origin_monitor_marker.exists())
        self.assert_monitor_contract(self.feature_origin, workspace, workspace_mode=True)
        worker = self.latest_worker()
        self.assertEqual(worker["cwd"], str(workspace.resolve()))
        self.assertEqual(worker["argv"][worker["argv"].index("--workspace") + 1], str(workspace.resolve()))
        self.assertIn("--environment development", self.worktree_log.read_text(encoding="utf-8"))

        self.tamper_workspace_harness(workspace)
        result = self.delegate(self.feature_origin, "--worktree", "worker-task", "--prompt", "reuse")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(self.workspace_monitor_marker.exists())
        self.assertTrue(self.origin_monitor_marker.exists())
        self.assert_monitor_contract(self.feature_origin, workspace, workspace_mode=True)

        for alias in ("--workspace", "--continue-worktree"):
            result = self.delegate(self.feature_origin, alias, str(workspace), "--prompt", "continue")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse(self.workspace_monitor_marker.exists())
            self.assert_monitor_contract(self.feature_origin, workspace, workspace_mode=True)
            self.assertIn("EXISTING WORKTREE REQUIREMENT", " ".join(self.latest_worker()["argv"]))

    def test_environment_validation_failure_prevents_worker_start(self) -> None:
        workspace = self.home / "worktrees/price-memo/env-failure"
        workspace.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "-C", str(self.feature_origin), "worktree", "add", "-b", "fixture/env-failure", str(workspace), "HEAD"],
            check=True,
            capture_output=True,
        )
        result = self.delegate(
            self.feature_origin,
            "--workspace",
            str(workspace),
            "--prompt",
            "must not run",
            env_extra={"VALIDATE_FAIL": "1"},
        )
        self.assertEqual(result.returncode, 19, result.stdout + result.stderr)
        self.assertEqual(self.call_records(self.worker_call_log), [])
        self.assertFalse(self.workspace_monitor_marker.exists())

    def test_workspace_lock_is_correct_and_distinct_workspaces_run_concurrently(self) -> None:
        first = self.home / "worktrees/price-memo/lock-first"
        second = self.home / "worktrees/price-memo/lock-second"
        for name, workspace in (("lock-first", first), ("lock-second", second)):
            subprocess.run(
                ["git", "-C", str(self.feature_origin), "worktree", "add", "-b", f"fixture/{name}", str(workspace), "HEAD"],
                check=True,
                capture_output=True,
            )

        first_process = subprocess.Popen(
            [str(self.feature_origin / "scripts/delegate-cursor.sh"), "--workspace", str(first), "--prompt", "hold"],
            cwd=self.feature_origin,
            env={**self.env, "ORIGIN_ROOT": str(self.feature_origin), "MOCK_WORKER_MODE": "hold"},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            deadline = time.monotonic() + 5
            while len(self.call_records(self.worker_call_log)) < 1 and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertEqual(len(self.call_records(self.worker_call_log)), 1)

            duplicate = self.delegate(self.feature_origin, "--workspace", str(first), "--prompt", "duplicate")
            self.assertEqual(duplicate.returncode, 73, duplicate.stdout + duplicate.stderr)
            self.assertEqual(len(self.call_records(self.worker_call_log)), 1)

            parallel = self.delegate(self.feature_origin, "--workspace", str(second), "--prompt", "parallel")
            self.assertEqual(parallel.returncode, 0, parallel.stdout + parallel.stderr)
            self.assertEqual(len(self.call_records(self.worker_call_log)), 2)
            self.assert_monitor_contract(self.feature_origin, second, workspace_mode=True)
        finally:
            if first_process.poll() is None:
                first_process.send_signal(signal.SIGTERM)
            out, err = first_process.communicate(timeout=8)
        self.assertEqual(first_process.returncode, 143, out + err)
        retry = self.delegate(self.feature_origin, "--workspace", str(first), "--prompt", "retry")
        self.assertEqual(retry.returncode, 0, retry.stdout + retry.stderr)

    def test_worker_failure_report_and_signal_status_are_preserved(self) -> None:
        workspace = self.home / "worktrees/price-memo/failure"
        subprocess.run(
            ["git", "-C", str(self.feature_origin), "worktree", "add", "-b", "fixture/failure", str(workspace), "HEAD"],
            check=True,
            capture_output=True,
        )
        failed = self.delegate(
            self.feature_origin,
            "--workspace",
            str(workspace),
            "--prompt",
            "failure",
            env_extra={"MOCK_WORKER_MODE": "fail"},
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("result_event_status: error", failed.stdout)
        self.assertIn("outcome: cursor_agent_unclassified", failed.stdout)
        self.assertIn("FAIL: mock criterion", failed.stdout)

        holding = self.home / "worktrees/price-memo/signal"
        subprocess.run(
            ["git", "-C", str(self.feature_origin), "worktree", "add", "-b", "fixture/signal", str(holding), "HEAD"],
            check=True,
            capture_output=True,
        )
        process = subprocess.Popen(
            [str(self.feature_origin / "scripts/delegate-cursor.sh"), "--workspace", str(holding), "--prompt", "signal"],
            cwd=self.feature_origin,
            env={**self.env, "ORIGIN_ROOT": str(self.feature_origin), "MOCK_WORKER_MODE": "hold"},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            deadline = time.monotonic() + 5
            while len(self.call_records(self.worker_call_log)) < 2 and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertGreaterEqual(len(self.call_records(self.worker_call_log)), 2)
            process.send_signal(signal.SIGINT)
            out, err = process.communicate(timeout=8)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
        self.assertEqual(process.returncode, 130, out + err)
        self.assertIn("outcome: interrupted", out)
        self.assert_monitor_contract(self.feature_origin, holding, workspace_mode=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
