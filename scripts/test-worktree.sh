#!/usr/bin/env bash
set -euo pipefail

source_root="$(git rev-parse --show-toplevel)"
repository_name="$(basename "$source_root")"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/${repository_name}-worktree-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

fixture_home="$test_root/home"
fixture_repo="$test_root/source/$repository_name"
fixture_config="$fixture_home/.config/$repository_name/development"
fixture_bin="$test_root/bin"
command_log="$test_root/setup-commands.log"
mkdir -p "$fixture_repo/scripts" "$fixture_config/frontend" "$fixture_config/backend" "$fixture_bin"
mkdir -p "$fixture_config/secrets/ai-quota-ca"
cp "$source_root/scripts/worktree.sh" "$fixture_repo/scripts/worktree.sh"
cp "$source_root/scripts/worktree-remove-inspect.py" "$fixture_repo/scripts/worktree-remove-inspect.py"
cp "$source_root/scripts/cursor-devserver.py" "$fixture_repo/scripts/cursor-devserver.py"
cp "$source_root/scripts/backend-venv.sh" "$fixture_repo/scripts/backend-venv.sh"
chmod +x "$fixture_repo/scripts/backend-venv.sh"

git -C "$fixture_repo" init -b main >/dev/null
git -C "$fixture_repo" config user.name "Worktree Test"
git -C "$fixture_repo" config user.email "worktree-test@example.invalid"
mkdir -p "$fixture_repo/frontend" "$fixture_repo/backend"
: > "$fixture_repo/package-lock.json"
: > "$fixture_repo/frontend/package-lock.json"
: > "$fixture_repo/backend/pyproject.toml"
printf 'tracked\n' > "$fixture_repo/README.md"
printf '.env\nfrontend/.env\nfrontend/.env.local\nbackend/.env\n' > "$fixture_repo/.gitignore"
git -C "$fixture_repo" add .
git -C "$fixture_repo" commit -m "test fixture" >/dev/null
git init --bare "$test_root/origin.git" >/dev/null
git -C "$fixture_repo" remote add origin "$test_root/origin.git"
git -C "$fixture_repo" push origin main >/dev/null 2>&1
git -C "$fixture_repo" fetch origin refs/heads/main:refs/remotes/origin/main >/dev/null 2>&1
printf 'local-only\n' >> "$fixture_repo/README.md"
git -C "$fixture_repo" add README.md
git -C "$fixture_repo" commit -m "local branch only" >/dev/null

printf 'VITE_TEST_VALUE=fixture-only\n' > "$fixture_config/frontend/.env"
printf 'VITE_LOCAL_TEST_VALUE=fixture-only\n' > "$fixture_config/frontend/.env.local"
printf 'TEST_SECRET_MARKER=fixture-only\n' > "$fixture_config/.env"
printf 'excluded quota marker\n' > "$fixture_config/.env.ai-quota"
printf 'excluded service marker\n' > "$fixture_config/service_account.json"
printf 'excluded CA marker\n' > "$fixture_config/secrets/ai-quota-ca/root.crt"
cat > "$fixture_bin/npm" <<'EOF'
#!/usr/bin/env bash
printf 'npm' >> "$WORKTREE_TEST_LOG"
printf ' %s' "$@" >> "$WORKTREE_TEST_LOG"
printf '\n' >> "$WORKTREE_TEST_LOG"
EOF
cat > "$fixture_bin/uv" <<'EOF'
#!/usr/bin/env bash
printf 'uv' >> "$WORKTREE_TEST_LOG"
printf ' %s' "$@" >> "$WORKTREE_TEST_LOG"
printf '\n' >> "$WORKTREE_TEST_LOG"

if [[ "${1:-}" != sync ]]; then
  exit 0
fi

backend_dir=''
reinstall=0
args=("$@")
for index in "${!args[@]}"; do
  if [[ "${args[$index]}" == --directory && -n "${args[$index + 1]:-}" ]]; then
    backend_dir="${args[$index + 1]}"
  fi
  if [[ "${args[$index]}" == --reinstall ]]; then
    reinstall=1
  fi
done

write_managed_venv() {
  local target_backend="$1"
  local bin_dir="$target_backend/.venv/bin"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/python" <<'PY'
#!/usr/bin/env bash
if [[ "${1:-}" == "-c" ]]; then
  printf '%s\n' "$(cd "$(dirname "$0")/.." && pwd -P)"
  exit 0
fi
exit 0
PY
  chmod +x "$bin_dir/python"
  local python_path
  python_path="$(cd "$bin_dir" && pwd -P)/python"
  printf '#!%s\n' "$python_path" > "$bin_dir/uvicorn"
  chmod +x "$bin_dir/uvicorn"
}

if [[ -n "$backend_dir" ]]; then
  if [[ "$reinstall" -eq 1 || ! -x "$backend_dir/.venv/bin/python" ]]; then
    write_managed_venv "$backend_dir"
  fi
fi
EOF
chmod +x "$fixture_bin/npm" "$fixture_bin/uv"

write_stale_managed_venv() {
  local target_backend="$1"
  local bin_dir="$target_backend/.venv/bin"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/python" <<'PY'
#!/usr/bin/env bash
if [[ "${1:-}" == "-c" ]]; then
  printf '%s\n' '/stale/old-worktree/backend/.venv'
  exit 0
fi
exit 0
PY
  chmod +x "$bin_dir/python"
  printf '#!/stale/old-worktree/backend/.venv/bin/python\n' > "$bin_dir/uvicorn"
  chmod +x "$bin_dir/uvicorn"
}

export HOME="$fixture_home"
export PATH="$fixture_bin:$PATH"
export WORKTREE_TEST_LOG="$command_log"

"$fixture_repo/scripts/worktree.sh" create default-base --branch feature/default-base --no-setup >/dev/null
default_base_path="$fixture_home/worktrees/$repository_name/default-base"
[[ "$(git -C "$default_base_path" rev-parse HEAD)" == "$(git -C "$fixture_repo" rev-parse origin/main)" ]]
[[ "$(git -C "$default_base_path" rev-parse HEAD)" != "$(git -C "$fixture_repo" rev-parse HEAD)" ]]

create_output="$("$fixture_repo/scripts/worktree.sh" create review-task --branch feature/review-task --base main)"
worktree_path="$fixture_home/worktrees/$repository_name/review-task"
[[ -d "$worktree_path" ]]
[[ "$(readlink "$worktree_path/.env")" == "$fixture_config/.env" ]]
[[ "$(readlink "$worktree_path/frontend/.env")" == "$fixture_config/frontend/.env" ]]
[[ "$(readlink "$worktree_path/frontend/.env.local")" == "$fixture_config/frontend/.env.local" ]]
[[ ! -e "$worktree_path/.env.ai-quota" ]]
[[ ! -e "$worktree_path/service_account.json" ]]
[[ ! -e "$worktree_path/secrets/ai-quota-ca/root.crt" ]]
[[ "$(wc -l < "$command_log")" -eq 3 ]]
[[ "$create_output" != *"TEST_SECRET_MARKER=fixture-only"* ]]

rm "$worktree_path/.env"
printf 'existing target\n' > "$worktree_path/.env"
if "$fixture_repo/scripts/worktree.sh" setup "$worktree_path" --env-only >/dev/null 2>&1; then
  echo "Expected an existing environment file to be preserved." >&2
  exit 1
fi
[[ "$(cat "$worktree_path/.env")" == "existing target" ]]
rm "$worktree_path/.env"
"$fixture_repo/scripts/worktree.sh" setup "$worktree_path" --env-only >/dev/null

reuse_output="$("$fixture_repo/scripts/worktree.sh" reuse "$worktree_path" --no-setup)"
[[ "$reuse_output" == *"feature/review-task"* ]]
create_reuse_output="$("$fixture_repo/scripts/worktree.sh" create review-task --branch feature/review-task --base main --no-setup)"
[[ "$create_reuse_output" == *"Reusing existing worktree"* ]]
if "$fixture_repo/scripts/worktree.sh" create review-task --branch feature/other --base main --no-setup >/dev/null 2>&1; then
  echo "Expected an existing task path with another branch to be rejected." >&2
  exit 1
fi

if "$fixture_repo/scripts/worktree.sh" create another-task --branch feature/review-task --base main >/dev/null 2>&1; then
  echo "Expected an in-use branch to be rejected." >&2
  exit 1
fi

rm -rf "$worktree_path/backend/.venv"

printf 'dirty\n' > "$worktree_path/untracked-test-file"
if printf 'remove\n' | "$fixture_repo/scripts/worktree.sh" remove "$worktree_path" >/dev/null 2>&1; then
  echo "Expected a dirty worktree removal to be rejected." >&2
  exit 1
fi
[[ -d "$worktree_path" ]]

rm "$worktree_path/untracked-test-file"
printf 'remove\n' | "$fixture_repo/scripts/worktree.sh" remove "$worktree_path" >/dev/null
git -C "$fixture_repo" show-ref --verify --quiet refs/heads/feature/review-task

"$fixture_repo/scripts/worktree.sh" create venv-task --branch feature/venv-task --no-setup >/dev/null
venv_worktree="$fixture_home/worktrees/$repository_name/venv-task"
: > "$command_log"
if ! "$fixture_repo/scripts/worktree.sh" setup "$venv_worktree" >"$test_root/venv-setup.log" 2>&1; then
  echo "Expected managed backend setup to succeed." >&2
  cat "$test_root/venv-setup.log" >&2
  exit 1
fi
if [[ ! -d "$venv_worktree/backend/.venv" || -L "$venv_worktree/backend/.venv" ]]; then
  echo "Expected backend/.venv to be an ordinary directory." >&2
  exit 1
fi
if ! "$venv_worktree/scripts/backend-venv.sh" preflight "$venv_worktree" >"$test_root/venv-preflight.log" 2>&1; then
  echo "Expected healthy backend preflight after setup." >&2
  cat "$test_root/venv-preflight.log" >&2
  exit 1
fi
: > "$command_log"
"$fixture_repo/scripts/worktree.sh" reuse "$venv_worktree" >/dev/null
if grep -Fq 'uv sync' "$command_log"; then
  echo "Expected a healthy reuse setup to avoid syncing the backend virtualenv." >&2
  cat "$command_log" >&2
  exit 1
fi

write_stale_managed_venv "$venv_worktree/backend"
if "$venv_worktree/scripts/backend-venv.sh" preflight "$venv_worktree" >"$test_root/stale-preflight.log" 2>&1; then
  echo "Expected stale backend/.venv to block dev preflight." >&2
  exit 1
fi
[[ "$(cat "$test_root/stale-preflight.log")" == *'bash scripts/worktree.sh setup'* ]]
: > "$command_log"
if ! "$fixture_repo/scripts/worktree.sh" setup "$venv_worktree" >"$test_root/stale-repair.log" 2>&1; then
  echo "Expected stale managed backend/.venv repair to succeed." >&2
  cat "$test_root/stale-repair.log" >&2
  exit 1
fi
if ! grep -Fq 'uv sync --reinstall' "$command_log"; then
  echo "Expected stale repair to run uv sync --reinstall." >&2
  cat "$command_log" >&2
  exit 1
fi
if ! "$venv_worktree/scripts/backend-venv.sh" preflight "$venv_worktree" >"$test_root/repaired-preflight.log" 2>&1; then
  echo "Expected backend preflight to pass after stale repair." >&2
  cat "$test_root/repaired-preflight.log" >&2
  exit 1
fi

rm -rf "$venv_worktree/backend/.venv"
ln -s "$test_root/external-venv" "$venv_worktree/backend/.venv"
mkdir -p "$test_root/external-venv"
if "$fixture_repo/scripts/worktree.sh" setup "$venv_worktree" >"$test_root/symlink-setup.log" 2>&1; then
  echo "Expected a symlinked backend/.venv to block automatic repair." >&2
  exit 1
fi
[[ "$(cat "$test_root/symlink-setup.log")" == *'symlink'* ]]
[[ -L "$venv_worktree/backend/.venv" ]]

rm "$venv_worktree/backend/.venv"
ln -s "$test_root/missing-venv" "$venv_worktree/backend/.venv"
if "$fixture_repo/scripts/worktree.sh" setup "$venv_worktree" >"$test_root/broken-symlink-setup.log" 2>&1; then
  echo "Expected a broken symlinked backend/.venv to block setup." >&2
  exit 1
fi
[[ "$(cat "$test_root/broken-symlink-setup.log")" == *'symlink'* ]]
[[ -L "$venv_worktree/backend/.venv" ]]

python3 "$source_root/scripts/test-worktree-remove-guard.py"

echo "Worktree workflow tests passed."
