#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(pwd -P)"
config_file="$workspace_root/.cursor/playwright-mcp.json"
profile_dir="${HOME:?HOME must be set}/.local/state/price-memo/playwright-profile"

exec npx --yes @playwright/mcp@latest \
  --config "$config_file" \
  --user-data-dir "$profile_dir"
