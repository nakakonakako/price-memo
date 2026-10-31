#!/usr/bin/env python3
"""Mock-only contract tests for delegate-cursor.sh CLI behavior."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DelegateCursorCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="price-delegate-cli-")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        (self.repo / "scripts").mkdir(parents=True)
        for name in ("delegate-cursor.sh", "delegate-cursor-monitor.py"):
            source = ROOT / "scripts" / name
            target = self.repo / "scripts" / name
            target.write_bytes(source.read_bytes())
            target.chmod(0o755)
        worktree_script = self.repo / "scripts/worktree.sh"
        worktree_script.write_text(
            "#!/usr/bin/env bash\n"
            "printf '%s\\n' \"$*\" >> \"$WORKTREE_OP_LOG\"\n",
            encoding="utf-8",
        )
        worktree_script.chmod(0o755)
        (self.repo / "tasks").mkdir()
        self.relative_task = self.repo / "tasks/order.md"
        self.relative_task.write_text("caller-root instruction sentinel\n", encoding="utf-8")
        subprocess.run(["git", "init", "-b", "main", str(self.repo)], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.name", "Fixture"], check=True)
        subprocess.run(
            ["git", "-C", str(self.repo), "config", "user.email", "fixture@example.invalid"],
            check=True,
        )
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        subprocess.run(
            ["git", "-C", str(self.repo), "commit", "-m", "fixture"],
            check=True,
            capture_output=True,
        )
        self.workspace = self.root / "workspace"
        subprocess.run(
            ["git", "-C", str(self.repo), "worktree", "add", "-b", "fixture/workspace", str(self.workspace)],
            check=True,
            capture_output=True,
        )
        (self.workspace / "tasks/order.md").write_text(
            "workspace instruction must not replace caller instruction\n", encoding="utf-8"
        )

        self.fake_bin = self.root / "bin"
        self.fake_bin.mkdir()
        self.args_file = self.root / "agent-args.json"
        self.worker_marker = self.root / "worker-started"
        fake_agent = self.fake_bin / "agent"
        fake_agent.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            "open(os.environ['AGENT_ARGS'], 'w').write(json.dumps(sys.argv[1:]))\n"
            "open(os.environ['WORKER_MARKER'], 'w').write('started')\n"
            "print(json.dumps({'type':'result','subtype':'success','is_error':False}), flush=True)\n",
            encoding="utf-8",
        )
        fake_agent.chmod(0o755)
        self.worktree_log = self.root / "worktree-ops.log"
        self.env = {
            **os.environ,
            "PATH": f"{self.fake_bin}{os.pathsep}{os.environ['PATH']}",
            "HOME": str(self.root / "home"),
            "XDG_STATE_HOME": str(self.root / "state"),
            "AGENT_ARGS": str(self.args_file),
            "WORKER_MARKER": str(self.worker_marker),
            "WORKTREE_OP_LOG": str(self.worktree_log),
        }
        Path(self.env["HOME"]).mkdir()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_delegate(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.repo / "scripts/delegate-cursor.sh"), *args],
            cwd=self.repo,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

    def agent_args(self) -> list[str]:
        return json.loads(self.args_file.read_text(encoding="utf-8"))

    def assert_rejected_before_worktree_or_worker(self, *args: str) -> None:
        self.args_file.unlink(missing_ok=True)
        self.worker_marker.unlink(missing_ok=True)
        self.worktree_log.unlink(missing_ok=True)
        result = self.run_delegate(*args)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertFalse(self.args_file.exists())
        self.assertFalse(self.worker_marker.exists())
        self.assertFalse(self.worktree_log.exists())

    def test_all_six_model_routes_keep_selected_model_and_manual_mcp_approval(self) -> None:
        cases = (
            ((), "composer-2.5"),
            (("--tier", "normal"), "grok-4.7-medium"),
            (("--tier", "hard"), "grok-4.7-high"),
            (("--fallback-tier", "light"), "gemini-3.8-flash-low"),
            (("--fallback-tier", "normal"), "claude-sonnet-5-5-medium"),
            (("--model-override", "gpt-5.6-luna-medium"), "gpt-5.6-luna-medium"),
        )
        for route_args, model in cases:
            with self.subTest(model=model):
                self.args_file.unlink(missing_ok=True)
                self.worker_marker.unlink(missing_ok=True)
                result = self.run_delegate(
                    *route_args, "--allow-dirty", "--prompt", "mock task"
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                args = self.agent_args()
                self.assertIn("--trust", args)
                self.assertEqual(args[args.index("--model") + 1], model)
                self.assertNotIn("--approve-mcps", args)
                self.assertTrue(self.worker_marker.exists())

    def test_no_trust_omits_trust_and_trust_flag_reenables_it(self) -> None:
        result = self.run_delegate(
            "--allow-dirty", "--no-trust", "--prompt", "mock task"
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("--trust", self.agent_args())

        self.args_file.unlink()
        result = self.run_delegate(
            "--allow-dirty", "--no-trust", "--trust", "--prompt", "mock task"
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("--trust", self.agent_args())

    def test_duplicate_and_mutually_exclusive_model_options_fail_early(self) -> None:
        work = ("--worktree", "must-not-create")
        self.assert_rejected_before_worktree_or_worker(
            *work, "--fallback-tier", "light", "--fallback-tier", "normal", "--prompt", "x"
        )
        self.assert_rejected_before_worktree_or_worker(
            *work,
            "--model-override",
            "gpt-5.6-luna-medium",
            "--model-override",
            "gpt-5.6-luna-medium",
            "--prompt",
            "x",
        )
        self.assert_rejected_before_worktree_or_worker(
            *work, "--fallback-tier", "light", "--tier", "normal", "--prompt", "x"
        )
        self.assert_rejected_before_worktree_or_worker(
            *work,
            "--fallback-tier",
            "light",
            "--model-override",
            "gpt-5.6-luna-medium",
            "--prompt",
            "x",
        )
        self.assert_rejected_before_worktree_or_worker(
            *work,
            "--model-override",
            "gpt-5.6-luna-medium",
            "--tier",
            "hard",
            "--prompt",
            "x",
        )
        self.assert_rejected_before_worktree_or_worker(
            *work, "--tier", "invalid", "--prompt", "x"
        )
        self.assert_rejected_before_worktree_or_worker(
            *work, "--fallback-tier", "hard", "--prompt", "x"
        )
        self.assert_rejected_before_worktree_or_worker(
            *work, "--model-override", "unsupported-model", "--prompt", "x"
        )

    def test_relative_task_file_uses_caller_root_before_workspace_switch(self) -> None:
        result = self.run_delegate(
            "--workspace", str(self.workspace), "--task-file", "tasks/order.md"
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        prompt = " ".join(self.agent_args())
        self.assertIn("caller-root instruction sentinel", prompt)
        self.assertNotIn("workspace instruction must not replace", prompt)
        self.assertIn("reuse", self.worktree_log.read_text(encoding="utf-8"))

    def test_absolute_task_file_and_continue_worktree_alias_are_preserved(self) -> None:
        absolute_task = self.root / "absolute-order.md"
        absolute_task.write_text("absolute instruction sentinel\n", encoding="utf-8")
        result = self.run_delegate(
            "--continue-worktree", str(self.workspace), "--task-file", str(absolute_task)
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("absolute instruction sentinel", " ".join(self.agent_args()))
        self.assertIn("EXISTING WORKTREE REQUIREMENT", " ".join(self.agent_args()))
        self.assertIn("reuse", self.worktree_log.read_text(encoding="utf-8"))

    def test_missing_task_file_is_rejected_before_worktree_or_worker(self) -> None:
        self.assert_rejected_before_worktree_or_worker(
            "--worktree", "must-not-create", "--task-file", "missing.md"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
