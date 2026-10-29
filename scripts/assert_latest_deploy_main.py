#!/usr/bin/env python3
"""Fail closed unless this deployment still targets the current price-memo main."""

from __future__ import annotations

import os
import re
import subprocess
import sys

REPOSITORY = "nakakonakako/price-memo"
SHA = re.compile(r"^[0-9a-f]{40}$")


def main() -> int:
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    ref = os.environ.get("GITHUB_REF", "")
    commit = os.environ.get("GITHUB_SHA", "")
    if repository != REPOSITORY or ref != "refs/heads/main" or not SHA.fullmatch(commit):
        print("deployment freshness check: invalid repository, ref, or commit", file=sys.stderr)
        return 2

    try:
        result = subprocess.run(
            ["git", "ls-remote", "origin", "refs/heads/main"],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        print("deployment freshness check: could not read main", file=sys.stderr)
        return 2

    lines = result.stdout.splitlines()
    remote_commit = lines[0].split(maxsplit=1)[0] if result.returncode == 0 and len(lines) == 1 else ""
    if not SHA.fullmatch(remote_commit):
        print("deployment freshness check: could not read main", file=sys.stderr)
        return 2
    if remote_commit != commit:
        print("deployment freshness check: deployment commit is no longer main", file=sys.stderr)
        return 1

    print("deployment freshness check: current main commit confirmed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
