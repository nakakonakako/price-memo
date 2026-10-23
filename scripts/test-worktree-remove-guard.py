#!/usr/bin/env python3
"""Tests for worktree removal process inspection."""

from __future__ import annotations

import importlib.util
import json
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

CURSOR_SPEC = importlib.util.spec_from_file_location(
    "cursor_devserver", ROOT / "scripts/cursor-devserver.py"
)
assert CURSOR_SPEC and CURSOR_SPEC.loader
CURSOR = importlib.util.module_from_spec(CURSOR_SPEC)
sys.modules[CURSOR_SPEC.name] = CURSOR
CURSOR_SPEC.loader.exec_module(CURSOR)


class WorktreeRemoveGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="worktree-remove-guard-")
        self.base = Path(self.temp.name)
        self.fixture_repo = self.base / "source"
        self.home = self.base / "home"
        self.state_base = self.base / "cursor-state"
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
        self._orphan_managers: list[subprocess.Popen[bytes]] = []

    def tearDown(self) -> None:
        failures: list[str] = []
        try:
            # The isolated subreaper owns the intentionally orphaned process
            # from the Cursor-group test and can reap it without affecting
            # unrelated children of the test runner.
            for manager in list(self._orphan_managers):
                try:
                    self._cleanup_orphan_manager(manager)
                except Exception as exc:
                    failures.append(f"orphan manager PID {manager.pid} cleanup failed: {exc}")
                    if manager.poll() is None:
                        manager.kill()
                        try:
                            manager.communicate(timeout=3)
                        except subprocess.TimeoutExpired:
                            failures.append(f"orphan manager PID {manager.pid} did not exit after SIGKILL")
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

    def _cleanup_orphan_manager(self, manager: subprocess.Popen[bytes]) -> bytes:
        if manager.poll() is None and manager.stdin is not None:
            manager.stdin.write(b"cleanup\n")
            manager.stdin.flush()
        stdout, _ = manager.communicate(timeout=15)
        if manager.returncode != 0 or b"cleaned" not in stdout:
            self.fail(f"orphan manager PID {manager.pid} did not confirm leader and child cleanup")
        if manager in self._orphan_managers:
            self._orphan_managers.remove(manager)
        if manager in self._children:
            self._children.remove(manager)
        return stdout

    def _init_fixture_repo(self) -> None:
        scripts = self.fixture_repo / "scripts"
        scripts.mkdir(parents=True)
        for name in (
            "worktree.sh",
            "worktree-remove-inspect.py",
            "cursor-devserver.py",
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
            if INSPECT.inspect_worktree(cwd, state_base=self.state_base).blocked_pids:
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

    def test_subdir_cwd_detected(self) -> None:
        path = self._create_worktree("subdir-cwd", "feature/subdir-cwd")
        self._start_sleep(path, subdir="nested/task")
        outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertFalse(outcome.ok)
        self.assertTrue(outcome.blocked_pids)

    def test_similar_directory_not_matched(self) -> None:
        path = self._create_worktree("prefix", "feature/prefix")
        sibling = self.base / "outside-similar-dir"
        sibling.mkdir()
        outsider = subprocess.Popen(["sleep", "300"], cwd=sibling)
        self._children.append(outsider)
        outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertTrue(outcome.ok, outcome.reason)

    def test_proc_scan_failure_is_fail_closed(self) -> None:
        path = self._create_worktree("proc-fail", "feature/proc-fail")

        def fail_scan(_worktree: Path) -> tuple[tuple[int, ...], tuple[str, ...]]:
            return (), ("/proc is not readable (denied)",)

        with patch.object(INSPECT, "_proc_pids", side_effect=OSError("denied")):
            outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertFalse(outcome.ok)
        self.assertEqual(outcome.exit_code, 2)

    def test_second_inspection_catches_new_process(self) -> None:
        path = self._create_worktree("recheck", "feature/recheck")
        first = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertTrue(first.ok)
        self._start_sleep(path)
        second = INSPECT.inspect_worktree(path, state_base=self.state_base)
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

    def test_stale_cursor_session_does_not_block(self) -> None:
        path = self._create_worktree("stale-session", "feature/stale-session")
        dev = CURSOR.Devserver(path, state_base=self.state_base)
        session = {
            "version": CURSOR.VERSION,
            "session_id": "00000000-0000-4000-8000-000000000001",
            "nonce": "00000000-0000-4000-8000-000000000099",
            "created_at": 1,
            "worktree": dev.identity,
            "verified_project_ref": CURSOR.APPROVED_REF,
            "config_fingerprint": "a" * 64,
            "ports": dev.ports,
            "processes": {
                "backend": {
                    "pid": 999999,
                    "pgid": 999999,
                    "sid": 999999,
                    "starttime": 1,
                }
            },
            "listeners": {},
            "launches": {},
        }
        dev.save_session(session)
        outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertTrue(outcome.ok)

    def test_reused_session_pid_does_not_trust_stale_group(self) -> None:
        path = self._create_worktree("reused-pid", "feature/reused-pid")
        marker = "31111111-2222-4333-8444-555555555555"
        outsider = subprocess.Popen(
            ["sleep", "300"], cwd=self.fixture_repo,
            env={**os.environ, CURSOR.MARKER: marker}, start_new_session=True,
        )
        self._children.append(outsider)
        identity = CURSOR.process_identity(outsider.pid)
        assert identity is not None
        dev = CURSOR.Devserver(path, state_base=self.state_base)
        dev.save_session({
            "version": CURSOR.VERSION,
            "session_id": "00000000-0000-4000-8000-000000000004",
            "nonce": marker,
            "created_at": 1,
            "worktree": dev.identity,
            "verified_project_ref": CURSOR.APPROVED_REF,
            "config_fingerprint": "d" * 64,
            "ports": dev.ports,
            "processes": {"backend": {"pid": outsider.pid, "pgid": identity["pgid"], "sid": identity["sid"], "starttime": identity["starttime"] - 1}},
            "listeners": {},
            "launches": {},
        })
        outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertTrue(outcome.ok, outcome.reason)
        self.assertIsNone(outsider.poll())

    def test_invalid_session_blocks_without_touching_file(self) -> None:
        path = self._create_worktree("bad-session", "feature/bad-session")
        dev = CURSOR.Devserver(path, state_base=self.state_base)
        dev.state_dir.mkdir(parents=True, exist_ok=True)
        (dev.session_file).write_text("{not-json", encoding="utf-8")
        before = dev.session_file.read_text(encoding="utf-8")
        outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertFalse(outcome.ok)
        self.assertEqual(dev.session_file.read_text(encoding="utf-8"), before)

    def _run_orphaned_cursor_group_child(self, *, orphan: bool, simulate_exception: bool = False) -> None:
        path = self._create_worktree("cursor-child", "feature/cursor-child")
        outside = self.base / "outside-cwd"
        outside.mkdir()
        marker = "11111111-2222-4333-8444-555555555555"
        env = {**os.environ, CURSOR.MARKER: marker}
        # Keep a dedicated Linux subreaper as the sleep process's eventual
        # parent. This lets the test verify the orphaned process group and then
        # reap exactly its own child, without changing the test runner's
        # process-wide child-reaping behavior.
        manager_script = r"""
import ctypes, json, os, signal, subprocess, sys, time
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
    raise OSError(ctypes.get_errno(), "cannot enable isolated child reaper")
outside, target, marker = sys.argv[1:]
leader_code = (
    "import os,signal,subprocess; "
    f"p=subprocess.Popen(['sleep','300'],cwd={outside!r},env=os.environ); "
    "print(p.pid, flush=True); signal.pause()"
)
leader = subprocess.Popen([sys.executable, '-c', leader_code], cwd=target,
                          env={**os.environ, marker: os.environ[marker]},
                          start_new_session=True, stdout=subprocess.PIPE,
                          text=True)
line = leader.stdout.readline()
if not line:
    raise RuntimeError("leader did not report its child PID")
child_pid = int(line)
child_stat = open(f"/proc/{child_pid}/stat", encoding="ascii").read()
fields = child_stat[child_stat.rfind(')') + 2:].split()
identity = {"pid": child_pid, "starttime": int(fields[19]),
            "pgid": int(fields[2]), "sid": int(fields[3]), "leader": leader.pid}
leader_stat = open(f"/proc/{leader.pid}/stat", encoding="ascii").read()
leader_fields = leader_stat[leader_stat.rfind(')') + 2:].split()
identity.update({"leader_starttime": int(leader_fields[19]),
                 "leader_pgid": int(leader_fields[2]),
                 "leader_sid": int(leader_fields[3])})
print(json.dumps(identity), flush=True)
def identity_matches(pid, starttime, pgid, sid):
    try:
        raw = open(f"/proc/{pid}/stat", encoding="ascii").read()
        fields = raw[raw.rfind(')') + 2:].split()
        return (int(fields[19]) == starttime and int(fields[2]) == pgid and
                int(fields[3]) == sid and fields[0] != 'Z')
    except FileNotFoundError:
        return False
def stop_leader():
    if identity_matches(leader.pid, identity['leader_starttime'],
                        identity['leader_pgid'], identity['leader_sid']):
        leader.send_signal(signal.SIGTERM)
    try:
        leader.wait(timeout=3)
    except subprocess.TimeoutExpired:
        if not identity_matches(leader.pid, identity['leader_starttime'],
                                identity['leader_pgid'], identity['leader_sid']):
            raise RuntimeError("leader identity changed before forced cleanup")
        leader.kill()
        leader.wait(timeout=3)
    if identity_matches(leader.pid, identity['leader_starttime'],
                        identity['leader_pgid'], identity['leader_sid']):
        raise RuntimeError("leader remained alive after cleanup")
def cleanup_child():
    if identity_matches(child_pid, identity['starttime'], identity['pgid'], identity['sid']):
        os.kill(child_pid, signal.SIGTERM)
    deadline = time.monotonic() + 3
    reaped = False
    while time.monotonic() < deadline:
        try:
            waited, _ = os.waitpid(child_pid, os.WNOHANG)
            reaped = waited == child_pid
        except ChildProcessError:
            reaped = False  # The exited leader may not have been adopted yet.
        if reaped:
            return
        if not identity_matches(child_pid, identity['starttime'], identity['pgid'], identity['sid']):
            try:
                raw = open(f"/proc/{child_pid}/stat", encoding="ascii").read()
                fields = raw[raw.rfind(')') + 2:].split()
            except FileNotFoundError:
                # It may be our exited child awaiting waitpid after adoption.
                try:
                    os.waitpid(child_pid, os.WNOHANG)
                except ChildProcessError:
                    pass
                return
            if fields[0] == 'Z' and int(fields[19]) == identity['starttime']:
                os.waitpid(child_pid, 0)
                return
            raise RuntimeError("child identity changed; refusing to signal or reap another process")
        time.sleep(0.02)
    if not identity_matches(child_pid, identity['starttime'], identity['pgid'], identity['sid']):
        raise RuntimeError("child identity changed before SIGKILL")
    os.kill(child_pid, signal.SIGKILL)
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        try:
            waited, _ = os.waitpid(child_pid, os.WNOHANG)
            if waited == child_pid:
                return
        except ChildProcessError:
            pass
        time.sleep(0.02)
    raise RuntimeError("child did not exit and reap after SIGKILL")
for command in sys.stdin:
    command = command.strip()
    if command == "orphan":
        stop_leader()
        print("orphaned", flush=True)
    elif command == "cleanup":
        stop_leader()
        cleanup_child()
        print("cleaned", flush=True)
        break
"""
        manager = subprocess.Popen(
            [sys.executable, "-c", manager_script, str(outside), str(path), CURSOR.MARKER],
            cwd=self.base,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._children.append(manager)
        self._orphan_managers.append(manager)
        assert manager.stdout is not None and manager.stdin is not None
        record = json.loads(manager.stdout.readline())
        child_pid = record["pid"]
        leader_pid = record["leader"]
        identity = CURSOR.process_identity(leader_pid)
        self.assertIsNotNone(identity)
        self.assertEqual(record["pgid"], leader_pid)
        self.assertEqual(record["sid"], leader_pid)
        dev = CURSOR.Devserver(path, state_base=self.state_base)
        session = {
            "version": CURSOR.VERSION,
            "session_id": "00000000-0000-4000-8000-000000000002",
            "nonce": marker,
            "created_at": 1,
            "worktree": dev.identity,
            "verified_project_ref": CURSOR.APPROVED_REF,
            "config_fingerprint": "b" * 64,
            "ports": dev.ports,
            "processes": {
                "backend": {
                    "pid": leader_pid,
                    "pgid": leader_pid,
                    "sid": leader_pid,
                    "starttime": identity["starttime"],
                }
            },
            "listeners": {},
            "launches": {},
        }
        dev.save_session(session)
        session_before = dev.session_file.read_bytes()
        try:
            if orphan:
                manager.stdin.write(b"orphan\n")
                manager.stdin.flush()
                self.assertEqual(manager.stdout.readline().strip(), b"orphaned")
                outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
                self.assertFalse(outcome.ok)
                blocked = set(outcome.blocked_pids)
                self.assertNotIn(leader_pid, blocked)
                self.assertIn(child_pid, blocked)
                self.assertEqual(dev.session_file.read_bytes(), session_before)
            if simulate_exception:
                raise RuntimeError("simulated test interruption")
        finally:
            # This is the same path used by tearDown, including when the
            # leader has not yet been orphaned or an assertion raises.
            self._cleanup_orphan_manager(manager)
        self.assertFalse(Path(f"/proc/{child_pid}").exists(), "owned orphan must be reaped")
        self.assertFalse(Path(f"/proc/{leader_pid}").exists(), "owned leader must be reaped")

    def test_orphaned_cursor_group_child_with_moved_cwd(self) -> None:
        self._run_orphaned_cursor_group_child(orphan=True)

    def test_orphan_manager_cleanup_before_orphan(self) -> None:
        self._run_orphaned_cursor_group_child(orphan=False)

    def test_orphan_manager_cleanup_after_test_body_exception(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "simulated test interruption"):
            self._run_orphaned_cursor_group_child(orphan=False, simulate_exception=True)

    def test_unrelated_unreadable_cwd_does_not_block(self) -> None:
        path = self._create_worktree("unreadable-unrelated", "feature/unreadable-unrelated")
        with patch.object(INSPECT, "_proc_cwd", return_value=None):
            outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertTrue(outcome.ok, outcome.reason)

    def test_associated_process_inspection_failure_refuses(self) -> None:
        path = self._create_worktree("associated-failure", "feature/associated-failure")
        marker = "21111111-2222-4333-8444-555555555555"
        env = {**os.environ, CURSOR.MARKER: marker}
        leader = subprocess.Popen(
            ["sleep", "300"], cwd=self.fixture_repo, env=env, start_new_session=True
        )
        self._children.append(leader)
        identity = CURSOR.process_identity(leader.pid)
        assert identity is not None
        dev = CURSOR.Devserver(path, state_base=self.state_base)
        dev.save_session({
            "version": CURSOR.VERSION,
            "session_id": "00000000-0000-4000-8000-000000000003",
            "nonce": marker,
            "created_at": 1,
            "worktree": dev.identity,
            "verified_project_ref": CURSOR.APPROVED_REF,
            "config_fingerprint": "c" * 64,
            "ports": dev.ports,
            "processes": {"backend": {"pid": leader.pid, "pgid": identity["pgid"], "sid": identity["sid"], "starttime": identity["starttime"]}},
            "listeners": {},
            "launches": {},
        })
        with patch.object(INSPECT, "_proc_marker", side_effect=INSPECT.InspectionError("unreadable")):
            outcome = INSPECT.inspect_worktree(path, state_base=self.state_base)
        self.assertFalse(outcome.ok)
        self.assertEqual(outcome.exit_code, 2)


if __name__ == "__main__":
    unittest.main()
