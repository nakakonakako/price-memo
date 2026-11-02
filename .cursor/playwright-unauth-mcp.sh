#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(pwd -P)"
config_file="$workspace_root/.cursor/playwright-unauth-mcp.json"
browser_cache="${HOME:?HOME must be set}/.cache/ms-playwright"

# Keep this aligned with .cursor/playwright-mcp.sh and the package metadata.
mcp_version="0.0.83"
playwright_version="1.64.0-alpha-1790635538000"
chromium_revision="1247"

# Ignore inherited settings that could attach this MCP to saved or external
# browser state. The explicit isolated flag below selects an in-memory profile.
unset PLAYWRIGHT_MCP_USER_DATA_DIR
unset PLAYWRIGHT_MCP_STORAGE_STATE
unset PLAYWRIGHT_MCP_CDP_ENDPOINT
unset PLAYWRIGHT_MCP_CDP_HEADERS
unset PLAYWRIGHT_MCP_EXTENSION
unset PLAYWRIGHT_MCP_CONFIG
unset PLAYWRIGHT_MCP_ISOLATED
unset PLAYWRIGHT_MCP_SAVE_SESSION

export PLAYWRIGHT_BROWSERS_PATH="$browser_cache"

headless_shell="$browser_cache/chromium_headless_shell-$chromium_revision/chrome-headless-shell-linux64/chrome-headless-shell"
if [[ ! -x "$headless_shell" ]]; then
  npx --yes --package="playwright@$playwright_version" playwright install chromium
fi

exec npx --yes "@playwright/mcp@$mcp_version" \
  --config "$config_file" \
  --isolated
