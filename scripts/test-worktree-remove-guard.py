#!/usr/bin/env python3
"""Tests for worktree removal process inspection."""

from __future__ import annotations

import importlib.util
import os
import signal
import select
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

SPEC = importlib.util.spec_from_file_location(
    "worktree_remove_inspect", ROOT / "scripts/worktree-remove-inspect.py"
)
assert SPEC and SPEC.loader
INSPECT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = INSPECT
SPEC.loader.exec_module(INSPECT)

class WorktreeRemoveGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="worktree-remove-guard-")
        self.base = Path(self.temp.name)
        self.fixture_repo = self.base / "source"
        self.home = self.base / "home"
        self._init_fixture_repo()
        common_dir = subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture_repo),
                "rev-parse",
                "--path-format=absolute",
                "--git-common-dir",
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.repo_name = Path(common_dir).parent.name
        self.worktree_base = self.home / "worktrees" / self.repo_name
        self._children: list[subprocess.Popen[bytes]] = []

    def tearDown(self) -> None:
        failures: list[str] = []
        try:
            for child in self._children:
                if child.poll() is None:
                    try:
                        child.send_signal(signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            for child in self._children:
                if child.poll() is None:
                    try:
                        child.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        try:
                            child.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            failures.append(f"child PID {child.pid} did not exit after SIGKILL")
                if child.poll() is None:
                    failures.append(f"child PID {child.pid} is still running after cleanup")
        finally:
            self.temp.cleanup()
        if failures:
            self.fail("Process cleanup failed: " + "; ".join(failures))

    def _init_fixture_repo(self) -> None:
        scripts = self.fixture_repo / "scripts"
        scripts.mkdir(parents=True)
        for name in (
            "worktree.sh",
            "worktree-remove-inspect.py",
            "backend-venv.sh",
        ):
            src = ROOT / "scripts" / name
            if not src.exists():
                continue
            dst = scripts / name
            dst.write_bytes(src.read_bytes())
            if name.endswith(".sh"):
                dst.chmod(0o755)
        subprocess.run(["git", "init", "-b", "main", str(self.fixture_repo)], check=True)
        subprocess.run(
            ["git", "-C", str(self.fixture_repo), "config", "user.name", "Guard Test"],
            check=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture_repo),
                "config",
                "user.email",
                "guard@example.invalid",
            ],
            check=True,
        )
        (self.fixture_repo / "README.md").write_text("fixture\n")
        (self.fixture_repo / "frontend").mkdir()
        (self.fixture_repo / "backend").mkdir()
        (self.fixture_repo / "package-lock.json").write_text("")
        (self.fixture_repo / "frontend" / "package-lock.json").write_text("")
        (self.fixture_repo / "backend" / "pyproject.toml").write_text("")
        subprocess.run(["git", "-C", str(self.fixture_repo), "add", "."], check=True)
        subprocess.run(
            ["git", "-C", str(self.fixture_repo), "commit", "-qm", "fixture"],
            check=True,
        )
        origin = self.base / "origin.git"
        subprocess.run(["git", "init", "--bare", str(origin)], check=True)
        subprocess.run(
            ["git", "-C", str(self.fixture_repo), "remote", "add", "origin", str(origin)],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(self.fixture_repo), "push", "origin", "main"],
            check=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture_repo),
                "fetch",
                "origin",
                "refs/heads/main:refs/remotes/origin/main",
            ],
            check=True,
        )

    def _create_worktree(self, task: str, branch: str) -> Path:
        env = {**os.environ, "HOME": str(self.home)}
        subprocess.run(
            [
                str(self.fixture_repo / "scripts/worktree.sh"),
                "create",
                task,
                "--branch",
                branch,
                "--no-setup",
            ],
            check=True,
            env=env,
            capture_output=True,
            text=True,
        )
        return self.worktree_base / task

    def _remove_worktree(self, path: Path) -> subprocess.CompletedProcess[str]:
        env = {**os.environ, "HOME": str(self.home)}
        return subprocess.run(
            [str(self.fixture_repo / "scripts/worktree.sh"), "remove", str(path)],
            input="remove\n",
            text=True,
            capture_output=True,
            env=env,
        )

    def _start_sleep(self, cwd: Path, *, subdir: str | None = None) -> subprocess.Popen[bytes]:
        workdir = cwd / subdir if subdir else cwd
        workdir.mkdir(parents=True, exist_ok=True)
        child = subprocess.Popen(
            ["sleep", "300"],
            cwd=workdir,
            start_new_session=True,
        )
        self._children.append(child)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if INSPECT.inspect_worktree(cwd).blocked_pids:
                return child
            time.sleep(0.05)
        self.fail("sleep process was not observed under worktree")

    def test_clean_remove_succeeds(self) -> None:
        path = self._create_worktree("clean-remove", "feature/clean-remove")
        result = self._remove_worktree(path)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(path.exists())

    def test_dirty_worktree_still_rejected(self) -> None:
        path = self._create_worktree("dirty-guard", "feature/dirty-guard")
        (path / "dirty.txt").write_text("x")
        result = self._remove_worktree(path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("staged, unstaged, or untracked", result.stderr)
        self.assertTrue(path.exists())

    def test_worktree_process_blocks_remove(self) -> None:
        path = self._create_worktree("proc-block", "feature/proc-block")
        sleep_proc = self._start_sleep(path)
        result = self._remove_worktree(path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("process inspection", result.stderr)
        self.assertTrue(path.exists())
        sleep_proc.send_signal(signal.SIGTERM)
        sleep_proc.wait(timeout=3)
        self._children.remove(sleep_proc)
        result = self._remove_worktree(path)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_external_process_does_not_block(self) -> None:
        path = self._create_worktree("external-ok", "feature/external-ok")
        outsider = subprocess.Popen(["sleep", "300"], cwd=self.fixture_repo)
        self._children.append(outsider)
        result = self._remove_worktree(path)
        self.assertEqual(result.returncode, 0, result.stderr)
        outsider.send_signal(signal.SIGTERM)

    def test_other_worktree_process_does_not_block_target(self) -> None:
        target = self._create_worktree("other-wt-target", "feature/other-wt-target")
        other = self._create_worktree("other-wt-process", "feature/other-wt-process")
        process = self._start_sleep(other, subdir="nested")

        outcome = INSPECT.inspect_worktree(target)

        self.assertTrue(outcome.ok, outcome.reason)
        self.assertFalse(outcome.blocked_pids)
        self.assertIsNone(process.poll(), "guard must not stop another worktree process")

    def test_subdir_cwd_detected(self) -> None:
        path = self._create_worktree("subdir-cwd", "feature/subdir-cwd")
        self._start_sleep(path, subdir="nested/task")
        outcome = INSPECT.inspect_worktree(path)
        self.assertFalse(outcome.ok)
        self.assertTrue(outcome.blocked_pids)

    def test_stable_cwd_identity_blocks_and_allows_process_state_changes(self) -> None:
        path = self._create_worktree("stable-cwd", "feature/stable-cwd")
        pid = 987654
        before = INSPECT.ProcStat(pid, "S", pid, pid, 100)
        after = INSPECT.ProcStat(pid, "R", pid, pid, 100)
        with (
            patch.object(INSPECT, "_proc_pids", return_value=[pid]),
            patch.object(INSPECT, "_proc_stat", side_effect=[before, after]),
            patch.object(INSPECT, "_proc_cwd", return_value=path),
        ):
            outcome = INSPECT.inspect_worktree(path)
        self.assertFalse(outcome.ok)
        self.assertEqual(outcome.blocked_pids, (pid,))

    def test_stable_external_cwd_does_not_block(self) -> None:
        path = self._create_worktree("stable-external", "feature/stable-external")
        outside = self.base / "outside-cwd"
        outside.mkdir()
        pid = 987655
        stat = INSPECT.ProcStat(pid, "S", pid, pid, 100)
        with (
            patch.object(INSPECT, "_proc_pids", return_value=[pid]),
            patch.object(INSPECT, "_proc_stat", side_effect=[stat, stat]),
            patch.object(INSPECT, "_proc_cwd", return_value=outside),
        ):
            outcome = INSPECT.inspect_worktree(path)
        self.assertTrue(outcome.ok, outcome.reason)
        self.assertFalse(outcome.blocked_pids)

    def test_symlink_alias_uses_canonical_worktree_path(self) -> None:
        path = self._create_worktree("cwd-symlink", "feature/cwd-symlink")
        alias = self.base / "worktree-alias"
        alias.symlink_to(path, target_is_directory=True)
        pid = 987656
        stat = INSPECT.ProcStat(pid, "S", pid, pid, 100)
        with (
            patch.object(INSPECT, "_proc_pids", return_value=[pid]),
            patch.object(INSPECT, "_proc_stat", side_effect=[stat, stat]),
            patch.object(INSPECT, "_proc_cwd", return_value=path),
        ):
            outcome = INSPECT.inspect_worktree(alias)
        self.assertFalse(outcome.ok)
        self.assertEqual(outcome.blocked_pids, (pid,))

    def test_cwd_sample_is_discarded_when_pid_exits_is_reused_or_zombifies(self) -> None:
        path = self._create_worktree("cwd-pid-race", "feature/cwd-pid-race")
        pid = 987657
        before = INSPECT.ProcStat(pid, "S", pid, pid, 100)
        cases = (
            ("PID reused", INSPECT.ProcStat(pid, "S", pid, pid, 101)),
            ("process exited", None),
            ("process became zombie", INSPECT.ProcStat(pid, "Z", pid, pid, 100)),
        )
        for label, after in cases:
            with self.subTest(label=label):
                with (
                    patch.object(INSPECT, "_proc_pids", return_value=[pid]),
                    patch.object(INSPECT, "_proc_stat", side_effect=[before, after]),
                    patch.object(INSPECT, "_proc_cwd", return_value=path),
                ):
                    outcome = INSPECT.inspect_worktree(path)
                self.assertTrue(outcome.ok, outcome.reason)
                self.assertFalse(outcome.blocked_pids)

    def test_post_cwd_stat_failure_refuses_only_with_association_evidence(self) -> None:
        path = self._create_worktree("cwd-stat-failure", "feature/cwd-stat-failure")
        outside = self.base / "outside-stat-failure"
        outside.mkdir()
        pid = 987658
        before = INSPECT.ProcStat(pid, "S", pid, pid, 100)
        cases = (
            ("target cwd", path, False),
            ("external cwd", outside, True),
            ("unreadable cwd", INSPECT.InspectionError("cwd denied"), True),
        )
        for label, cwd_result, expected_ok in cases:
            with self.subTest(label=label):
                cwd_effect = (
                    {"side_effect": cwd_result}
                    if isinstance(cwd_result, Exception)
                    else {"return_value": cwd_result}
                )
                with (
                    patch.object(INSPECT, "_proc_pids", return_value=[pid]),
                    patch.object(
                        INSPECT,
                        "_proc_stat",
                        side_effect=[before, INSPECT.InspectionError("stat denied")],
                    ),
                    patch.object(INSPECT, "_proc_cwd", **cwd_effect),
                ):
                    outcome = INSPECT.inspect_worktree(path)
                self.assertEqual(outcome.ok, expected_ok, outcome.reason)
                self.assertEqual(bool(outcome.reason), not expected_ok)

    def test_unassociated_initial_stat_failure_is_skipped(self) -> None:
        path = self._create_worktree("unassociated-stat", "feature/unassociated-stat")
        with (
            patch.object(INSPECT, "_proc_pids", return_value=[987659]),
            patch.object(
                INSPECT, "_proc_stat", side_effect=INSPECT.InspectionError("denied")
            ),
            patch.object(INSPECT, "_proc_cwd") as cwd,
        ):
            outcome = INSPECT.inspect_worktree(path)
        self.assertTrue(outcome.ok, outcome.reason)
        cwd.assert_not_called()

    def test_similar_directory_not_matched(self) -> None:
        path = self._create_worktree("prefix", "feature/prefix")
        sibling = self.base / "outside-similar-dir"
        sibling.mkdir()
        outsider = subprocess.Popen(["sleep", "300"], cwd=sibling)
        self._children.append(outsider)
        outcome = INSPECT.inspect_worktree(path)
        self.assertTrue(outcome.ok, outcome.reason)

    def test_proc_scan_failure_is_fail_closed(self) -> None:
        path = self._create_worktree("proc-fail", "feature/proc-fail")

        def fail_scan(_worktree: Path) -> tuple[tuple[int, ...], tuple[str, ...]]:
            return (), ("/proc is not readable (denied)",)

        with patch.object(INSPECT, "_proc_pids", side_effect=OSError("denied")):
            outcome = INSPECT.inspect_worktree(path)
        self.assertFalse(outcome.ok)
        self.assertEqual(outcome.exit_code, 2)

    def test_second_inspection_catches_new_process(self) -> None:
        path = self._create_worktree("recheck", "feature/recheck")
        first = INSPECT.inspect_worktree(path)
        self.assertTrue(first.ok)
        self._start_sleep(path)
        second = INSPECT.inspect_worktree(path)
        self.assertFalse(second.ok)

    def test_process_started_at_prompt_blocks_real_remove(self) -> None:
        path = self._create_worktree("prompt-race", "feature/prompt-race")
        env = {**os.environ, "HOME": str(self.home)}
        remover = subprocess.Popen(
            ["bash", str(self.fixture_repo / "scripts/worktree.sh"), "remove", str(path)],
            cwd=self.fixture_repo,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._children.append(remover)
        assert remover.stdout is not None and remover.stdin is not None
        prompt = b""
        deadline = time.monotonic() + 10
        while b"Type remove to confirm" not in prompt and time.monotonic() < deadline:
            ready, _, _ = select.select([remover.stdout], [], [], 0.2)
            if ready:
                prompt += os.read(remover.stdout.fileno(), 4096)
        self.assertIn(b"Type remove to confirm", prompt)
        sleeper = self._start_sleep(path)
        remover.stdin.write(b"remove\n")
        remover.stdin.flush()
        stdout, stderr = remover.communicate(timeout=15)
        self.assertNotEqual(remover.returncode, 0, stdout.decode() + stderr.decode())
        self.assertIn(b"process inspection", stderr)
        self.assertTrue(path.exists())
        self.assertIsNone(sleeper.poll(), "guard must not stop the worktree process")

    def test_unrelated_unreadable_cwd_does_not_block(self) -> None:
        path = self._create_worktree("unreadable-unrelated", "feature/unreadable-unrelated")
        with patch.object(INSPECT, "_proc_cwd", return_value=None):
            outcome = INSPECT.inspect_worktree(path)
        self.assertTrue(outcome.ok, outcome.reason)


if __name__ == "__main__":
    unittest.main()
