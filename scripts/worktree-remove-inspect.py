#!/usr/bin/env python3
"""Inspect Linux processes before removing a Git worktree."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROC = Path("/proc")


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


def _same_process(before: ProcStat, after: ProcStat | None) -> bool:
    """Confirm the sampled PID still has the same live process identity."""
    return (
        after is not None
        and before.pid == after.pid
        and before.starttime == after.starttime
        and before.state != "Z"
        and after.state != "Z"
    )


def inspect_worktree(worktree_path: Path) -> InspectOutcome:
    try:
        root = worktree_path.resolve(strict=True)
        if not root.is_dir():
            raise InspectionError("Worktree path is not a directory")
        pids = _proc_pids()
    except (OSError, InspectionError) as exc:
        return InspectOutcome(False, reason=f"Process inspection failed: {exc}")

    stats: dict[int, ProcStat] = {}
    blocked: set[int] = set()
    errors: list[str] = []

    for pid in pids:
        if pid == os.getpid():
            continue
        try:
            stat = _proc_stat(pid)
        except InspectionError:
            # Without cwd evidence an unreadable PID is not attributed to the
            # target worktree.
            continue
        if stat is not None and stat.state != "Z":
            stats[pid] = stat

    # Direct cwd ownership is path-component based, after canonicalization.
    # Re-read stat after cwd so a PID that exited or was reused during the
    # sample is never attributed using the earlier process identity.
    for pid, before in stats.items():
        cwd_error: InspectionError | None = None
        try:
            cwd = _proc_cwd(pid)
        except InspectionError as exc:
            # Unrelated processes may be protected by Linux ptrace/Yama policy.
            cwd = None
            cwd_error = exc
        try:
            after = _proc_stat(pid)
        except InspectionError as exc:
            # A target cwd is evidence that this PID may belong to the
            # worktree. Do not allow an incomplete identity check to turn that
            # evidence into permission to remove.
            if _inside(cwd, root):
                errors.append(str(exc))
            continue
        if not _same_process(before, after):
            continue
        if cwd_error is None and _inside(cwd, root):
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
    args = parser.parse_args(argv)
    outcome = inspect_worktree(args.worktree)
    if not outcome.ok:
        print(outcome.reason, file=sys.stderr)
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
