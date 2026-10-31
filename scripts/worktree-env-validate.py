#!/usr/bin/env python3
"""Validate managed worktree dotenv paths without reading their contents."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

MANAGED = (".env", "frontend/.env", "frontend/.env.local", "backend/.env")
SCAN_DIRS = (".", "frontend", "backend", "backend/app")


def fail(message: str) -> None:
    print(f"[worktree-env] {message}", file=sys.stderr)
    raise SystemExit(2)


def validate(mode: str, workspace: Path, environment: str, repository: str) -> None:
    workspace = workspace.resolve(strict=True)
    config = Path.home() / ".config" / repository / environment
    if config.is_symlink():
        fail(f"Environment settings directory is a symlink: {config}")
    if config.exists() and not config.is_dir():
        fail(f"Environment settings path is not a directory: {config}")

    allowed = set(MANAGED)
    for directory in SCAN_DIRS:
        base = workspace if directory == "." else workspace / directory
        if not base.exists():
            continue
        if base.is_symlink() or not base.is_dir():
            fail(f"Workspace dotenv lookup directory is not a real directory: {directory}")
        for entry in base.iterdir():
            if entry.name.startswith(".env"):
                relative = entry.relative_to(workspace).as_posix()
                if relative not in allowed:
                    fail(f"Unexpected .env-related path in workspace: {relative}")

    for relative in MANAGED:
        source = config / relative
        target = workspace / relative
        parent = config
        for part in Path(relative).parts[:-1]:
            parent = parent / part
            if parent.is_symlink():
                fail(f"Environment settings directory must not be a symlink: {relative}")
            if parent.exists() and not parent.is_dir():
                fail(f"Environment settings parent is not a directory: {relative}")
        if source.is_symlink():
            fail(f"Environment source must be a regular file: {relative}")
        source_exists = source.exists()
        if source_exists and not source.is_file():
            fail(f"Environment source must be a regular file: {relative}")
        if target.is_symlink() and not target.exists():
            fail(f"Broken environment symlink: {relative}")
        target_exists = target.exists() or target.is_symlink()

        if not source_exists:
            if target_exists:
                fail(f"Environment link has no configured source: {relative}")
            continue
        if not target_exists:
            if mode == "strict":
                fail(f"Configured environment link is missing: {relative}")
            continue
        if not target.is_symlink():
            fail(f"Environment path is missing or is not a symlink: {relative}")
        try:
            actual = target.resolve(strict=True)
            expected = source.resolve(strict=True)
        except OSError:
            fail(f"Cannot resolve environment link: {relative}")
        if actual != expected:
            fail(f"Environment link does not point to selected settings: {relative}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("pre", "strict"))
    parser.add_argument("workspace", type=Path)
    parser.add_argument("--environment", default="development")
    parser.add_argument("--repository", default="")
    args = parser.parse_args()
    if not args.environment.replace("-", "").replace("_", "").isalnum():
        fail("Invalid environment name.")
    validate(args.mode, args.workspace, args.environment, args.repository or args.workspace.name)


if __name__ == "__main__":
    main()
