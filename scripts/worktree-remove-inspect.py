#!/usr/bin/env python3
"""Inspect Linux processes before removing a Git worktree."""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROC = Path("/proc")


def _load_cursor_devserver():
    spec = importlib.util.spec_from_file_location(
        "cursor_devserver", ROOT / "scripts/cursor-devserver.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load cursor-devserver module.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CURSOR = _load_cursor_devserver()


class InspectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProcStat:
    pid: int
    state: str
    pgid: int
    sid: int
    starttime: int


@dataclass(frozen=True)
class InspectOutcome:
    ok: bool
    blocked_pids: tuple[int, ...] = ()
    reason: str = ""

    @property
    def exit_code(self) -> int:
        return 0 if self.ok else (1 if self.blocked_pids else 2)


def _proc_stat(pid: int) -> ProcStat | None:
    try:
        raw = (PROC / str(pid) / "stat").read_text()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise InspectionError(f"PID {pid} stat inspection failed") from exc
    try:
        # comm is parenthesized and may itself contain spaces or parentheses.
        fields = raw[raw.rfind(")") + 2 :].split()
        return ProcStat(
            pid=pid,
            state=fields[0],
            pgid=int(fields[2]),
            sid=int(fields[3]),
            starttime=int(fields[19]),
        )
    except (IndexError, ValueError) as exc:
        raise InspectionError(f"PID {pid} stat data is invalid") from exc


def _proc_cwd(pid: int) -> Path | None:
    try:
        return Path(os.readlink(PROC / str(pid) / "cwd")).resolve(strict=True)
    except FileNotFoundError:
        return None
    except (OSError, RuntimeError) as exc:
        raise InspectionError(f"PID {pid} working directory inspection failed") from exc


def _proc_marker(pid: int) -> str | None:
    try:
        raw = (PROC / str(pid) / "environ").read_bytes()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise InspectionError(f"PID {pid} session marker inspection failed") from exc
    marker_prefix = (CURSOR.MARKER + "=").encode()
    for item in raw.split(b"\0"):
        if item.startswith(marker_prefix):
            return item[len(marker_prefix) :].decode(errors="replace")
    return None


def _proc_pids() -> list[int]:
    try:
        with os.scandir(PROC) as entries:
            return sorted(int(entry.name) for entry in entries if entry.name.isdecimal())
    except OSError as exc:
        raise InspectionError("/proc enumeration failed") from exc


def _inside(cwd: Path | None, root: Path) -> bool:
    if cwd is None:
        return False
    try:
        return cwd.is_relative_to(root)
    except ValueError:
        return False


def _load_session(worktree: Path, state_base: Path | None) -> tuple[dict[str, Any] | None, list[dict[str, int]], list[int]]:
    dev = CURSOR.Devserver(worktree, state_base=state_base)
    try:
        session = dev.load_session()
    except CURSOR.DevserverError as exc:
        raise InspectionError("Cursor devserver session cannot be read safely") from exc
    if session is None:
        return None, [], []
    if not isinstance(session, dict) or not dev.valid_session_header(session):
        raise InspectionError("Cursor devserver session is invalid")
    nonce = session.get("nonce")
    processes = session.get("processes")
    launches = session.get("launches")
    if not isinstance(nonce, str) or not nonce or not isinstance(processes, dict) or not isinstance(launches, dict):
        raise InspectionError("Cursor devserver session process data is invalid")
    groups: list[dict[str, int]] = []
    for name, process in processes.items():
        if name not in ("frontend", "backend") or not isinstance(process, dict):
            raise InspectionError("Cursor devserver session process data is invalid")
        try:
            group = {
                key: int(process[key])
                for key in ("pid", "pgid", "sid", "starttime")
            }
        except (KeyError, TypeError, ValueError) as exc:
            raise InspectionError("Cursor devserver session process data is incomplete") from exc
        if (
            group["pid"] <= 1
            or group["pid"] != group["pgid"]
            or group["sid"] != group["pgid"]
            or group["starttime"] <= 0
        ):
            raise InspectionError("Cursor devserver session process identity is invalid")
        groups.append(group)
    launch_pids: list[int] = []
    for name, launch in launches.items():
        if name not in ("frontend", "backend") or not isinstance(launch, dict):
            raise InspectionError("Cursor devserver launch data is invalid")
        try:
            pid = int(launch["pid"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InspectionError("Cursor devserver launch data is incomplete") from exc
        if pid <= 1:
            raise InspectionError("Cursor devserver launch PID is invalid")
        launch_pids.append(pid)
    return session, groups, launch_pids


def inspect_worktree(worktree_path: Path, *, state_base: Path | None = None) -> InspectOutcome:
    try:
        root = worktree_path.resolve(strict=True)
        if not root.is_dir():
            raise InspectionError("Worktree path is not a directory")
        session, groups, launch_pids = _load_session(root, state_base)
        pids = _proc_pids()
    except (OSError, InspectionError) as exc:
        return InspectOutcome(False, reason=f"Process inspection failed: {exc}")

    nonce = session.get("nonce") if session else None
    expected = {group["pid"]: group for group in groups}
    launch_set = set(launch_pids)
    stats: dict[int, ProcStat] = {}
    blocked: set[int] = set()
    errors: list[str] = []

    # Read stat for all PIDs first: this detects membership in recorded groups even
    # after their leader has exited or a child has changed its cwd.
    for pid in pids:
        if pid == os.getpid():
            continue
        try:
            stat = _proc_stat(pid)
        except InspectionError as exc:
            if pid in expected or pid in launch_set:
                errors.append(str(exc))
            continue
        if stat is not None and stat.state != "Z":
            stats[pid] = stat

    # Direct cwd ownership is path-component based, after canonicalization.
    for pid in stats:
        try:
            cwd = _proc_cwd(pid)
        except InspectionError:
            # Unrelated processes may be protected by Linux ptrace/Yama policy.
            continue
        if _inside(cwd, root):
            blocked.add(pid)

    # Validate recorded leaders by PID and start time before trusting their group IDs.
    valid_groups: list[dict[str, int]] = []
    for group in groups:
        leader = stats.get(group["pid"])
        if leader is None:
            # The leader may have exited while its process group still has children.
            # The recorded IDs remain only candidate evidence; a live matching
            # member must still carry the private session marker below.
            valid_groups.append(group)
            continue
        if leader.starttime != group["starttime"]:
            continue  # PID was reused; its old PGID/SID record is stale.
        if leader.pgid == group["pgid"] and leader.sid == group["sid"]:
            valid_groups.append(group)
            blocked.add(group["pid"])

    # A matching session marker plus recorded PGID/SID catches orphaned children.
    # If the marker cannot be read for a matching member, refuse rather than assume.
    if nonce:
        for pid, stat in stats.items():
            matching = [
                g
                for g in valid_groups
                if stat.pgid == g["pgid"] and stat.sid == g["sid"]
            ]
            if not matching:
                continue
            try:
                marker = _proc_marker(pid)
            except InspectionError as exc:
                errors.append(str(exc))
                continue
            try:
                cwd = _proc_cwd(pid)
            except InspectionError as exc:
                errors.append(str(exc))
                continue
            if marker == nonce:
                blocked.add(pid)
            elif _inside(cwd, root):
                blocked.add(pid)

    # Provisional launch records lack a start time. Require a live, genuine session
    # leader carrying the session marker; a stale/reused PID cannot prove ownership.
    for pid in launch_set - set(expected):
        stat = stats.get(pid)
        if stat is None:
            continue
        try:
            marker = _proc_marker(pid)
        except InspectionError as exc:
            errors.append(str(exc))
            continue
        try:
            cwd = _proc_cwd(pid)
        except InspectionError as exc:
            errors.append(str(exc))
            continue
        if marker == nonce and stat.pgid == pid and stat.sid == pid:
            blocked.add(pid)
        elif _inside(cwd, root):
            blocked.add(pid)

    if errors:
        return InspectOutcome(
            False,
            reason="Process inspection failed: " + "; ".join(errors[:5]),
        )
    if blocked:
        pids_text = ", ".join(str(pid) for pid in sorted(blocked)[:8])
        extra = f" (and {len(blocked) - 8} more)" if len(blocked) > 8 else ""
        return InspectOutcome(
            False,
            tuple(sorted(blocked)),
            f"Active worktree processes found (PIDs: {pids_text}{extra}). Stop them and retry.",
        )
    return InspectOutcome(True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worktree", type=Path)
    parser.add_argument(
        "--state-base",
        type=Path,
        default=None,
        help="Override Cursor state directory (tests only)",
    )
    args = parser.parse_args(argv)
    outcome = inspect_worktree(args.worktree, state_base=args.state_base)
    if not outcome.ok:
        print(outcome.reason, file=sys.stderr)
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
