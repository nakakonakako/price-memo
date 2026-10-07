#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(pwd -P)"
config_file="$workspace_root/.cursor/playwright-mcp.json"
profile_dir="${HOME:?HOME must be set}/.local/state/price-memo/playwright-profile"
browser_cache="$HOME/.cache/ms-playwright"

# Update these together after checking the MCP package's exact Playwright
# dependencies and its playwright-core/browsers.json.
mcp_version="0.0.83"
playwright_version="1.64.0-alpha-1790635538000"
chromium_revision="1247"

export PLAYWRIGHT_BROWSERS_PATH="$browser_cache"

headless_shell="$browser_cache/chromium_headless_shell-$chromium_revision/chrome-headless-shell-linux64/chrome-headless-shell"
if [[ ! -x "$headless_shell" ]]; then
  npx --yes --package="playwright@$playwright_version" playwright install chromium
fi

exec npx --yes "@playwright/mcp@$mcp_version" \
  --config "$config_file" \
  --user-data-dir "$profile_dir"
