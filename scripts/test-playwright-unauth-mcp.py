#!/usr/bin/env python3
"""Verify the unauthenticated Playwright MCP cannot load shared browser state."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib


ROOT = Path(__file__).resolve().parents[1]
MCP_VERSION = "0.0.83"
PLAYWRIGHT_VERSION = "1.64.0-alpha-1790635538000"
CHROMIUM_REVISION = "1247"
FORBIDDEN_ENV = (
    "PLAYWRIGHT_MCP_USER_DATA_DIR",
    "PLAYWRIGHT_MCP_STORAGE_STATE",
    "PLAYWRIGHT_MCP_CDP_ENDPOINT",
    "PLAYWRIGHT_MCP_CDP_HEADERS",
    "PLAYWRIGHT_MCP_EXTENSION",
    "PLAYWRIGHT_MCP_CONFIG",
    "PLAYWRIGHT_MCP_ISOLATED",
    "PLAYWRIGHT_MCP_SAVE_SESSION",
)


def main() -> None:
    codex = tomllib.loads((ROOT / ".codex/config.toml").read_text())
    assert codex["agents"]["enabled"] is True
    assert codex["agents"]["max_concurrent_threads_per_session"] == 1
    for name in ("playwright", "playwright-unauth"):
        server = codex["mcp_servers"][name]
        assert server["command"] == "bash"
        assert server["args"] == [f".cursor/{name}-mcp.sh"]
        assert "cwd" not in server
    assert codex["mcp_servers"]["playwright-unauth"]["enabled_tools"] == [
        "browser_navigate", "browser_snapshot", "browser_close"
    ]

    mcp_config = json.loads((ROOT / ".cursor/mcp.json").read_text())
    servers = mcp_config["mcpServers"]
    assert servers["playwright"] == {
        "type": "stdio",
        "command": "bash",
        "args": [".cursor/playwright-mcp.sh"],
    }
    assert servers["playwright-unauth"] == {
        "type": "stdio",
        "command": "bash",
        "args": [".cursor/playwright-unauth-mcp.sh"],
    }

    config_path = ROOT / ".cursor/playwright-unauth-mcp.json"
    isolated_config = json.loads(config_path.read_text())
    assert isolated_config == {
        "browser": {"browserName": "chromium"},
        "snapshot": {"mode": "none"},
    }

    auth_launcher = (ROOT / ".cursor/playwright-mcp.sh").read_text()
    unauth_launcher_path = ROOT / ".cursor/playwright-unauth-mcp.sh"
    unauth_launcher = unauth_launcher_path.read_text()
    assert unauth_launcher_path.stat().st_mode & 0o111
    for launcher in (auth_launcher, unauth_launcher):
        assert f'mcp_version="{MCP_VERSION}"' in launcher
        assert f'playwright_version="{PLAYWRIGHT_VERSION}"' in launcher
        assert f'chromium_revision="{CHROMIUM_REVISION}"' in launcher
    assert "--user-data-dir" in auth_launcher
    assert "playwright-profile" in auth_launcher
    assert "--user-data-dir" not in unauth_launcher
    assert "--storage-state" not in unauth_launcher
    assert "playwright-profile" not in unauth_launcher
    assert "--isolated" in unauth_launcher

    with tempfile.TemporaryDirectory(prefix="price-memo-unauth-mcp-test-") as tmp:
        temp_root = Path(tmp)
        home = temp_root / "home"
        bin_dir = temp_root / "bin"
        capture_path = temp_root / "capture.json"
        fake_npx = bin_dir / "npx"
        browser_binary = (
            home
            / ".cache/ms-playwright"
            / f"chromium_headless_shell-{CHROMIUM_REVISION}"
            / "chrome-headless-shell-linux64/chrome-headless-shell"
        )
        browser_binary.parent.mkdir(parents=True)
        browser_binary.touch()
        browser_binary.chmod(0o700)
        bin_dir.mkdir(parents=True)
        fake_npx.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            f"json.dump({{'args': sys.argv[1:], 'forbiddenEnv': "
            f"{{key: key in os.environ for key in {FORBIDDEN_ENV!r}}}}}, "
            f"open({str(capture_path)!r}, 'w'))\n"
        )
        fake_npx.chmod(0o700)

        env = os.environ.copy()
        env.update(
            {
                "HOME": str(home),
                "PATH": f"{bin_dir}{os.pathsep}{env['PATH']}",
                "PLAYWRIGHT_MCP_USER_DATA_DIR": "/sentinel/shared-profile",
                "PLAYWRIGHT_MCP_STORAGE_STATE": "/sentinel/storage-state.json",
                "PLAYWRIGHT_MCP_CDP_ENDPOINT": "http://127.0.0.1:9222",
                "PLAYWRIGHT_MCP_CDP_HEADERS": "Authorization=sentinel",
                "PLAYWRIGHT_MCP_EXTENSION": "1",
                "PLAYWRIGHT_MCP_CONFIG": "/sentinel/other-config.json",
                "PLAYWRIGHT_MCP_ISOLATED": "false",
                "PLAYWRIGHT_MCP_SAVE_SESSION": "true",
            }
        )
        # The temporary fake binary and fake npx make this a launch-argument
        # test only; no browser process or real profile is started.
        subprocess.run(
            ["bash", str(unauth_launcher_path)],
            cwd=ROOT,
            env=env,
            check=True,
        )

        captured = json.loads(capture_path.read_text())
        args = captured["args"]
        assert "@playwright/mcp@0.0.83" in args
        assert "--isolated" in args
        assert "--config" in args
        assert str(config_path) in args
        assert not any(
            arg in {"--user-data-dir", "--storage-state", "--cdp-endpoint", "--extension"}
            for arg in args
        )
        assert not any(
            arg.startswith(("--user-data-dir=", "--storage-state=", "--cdp-endpoint="))
            for arg in args
        )
        assert not any(captured["forbiddenEnv"].values())

    print("Unauthenticated Playwright MCP isolation checks passed.")


if __name__ == "__main__":
    main()
