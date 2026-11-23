#!/usr/bin/env python3
"""Limit Claude Code's playwright-unauth MCP to the tools Codex enables.

Mirrors `enabled_tools` for `playwright-unauth` in `.codex/config.toml`.
"""
import json
import sys

SERVER_PREFIX = "mcp__playwright-unauth__"
ALLOWED_TOOLS = frozenset({
    "browser_navigate",
    "browser_snapshot",
    "browser_close",
    "browser_resize",
    "browser_take_screenshot",
})


def main() -> int:
    try:
        tool_name = json.load(sys.stdin).get("tool_name", "")
    except (json.JSONDecodeError, AttributeError):
        print("playwright-unauth tool check could not read the hook input.", file=sys.stderr)
        return 2
    if not isinstance(tool_name, str) or not tool_name.startswith(SERVER_PREFIX):
        return 0
    if tool_name[len(SERVER_PREFIX):] in ALLOWED_TOOLS:
        return 0
    print(
        f"{tool_name} is not enabled for playwright-unauth. "
        f"Allowed tools: {', '.join(sorted(ALLOWED_TOOLS))}.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
