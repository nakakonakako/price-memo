#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

die() {
  printf '%s\n' "$1" >&2
  exit 2
}

usage() {
  cat <<'EOF'
Usage:
  scripts/backend-venv.sh preflight <repo-root>
  scripts/backend-venv.sh ensure <repo-root>

preflight validates the managed backend/.venv without installing dependencies.
ensure creates or repairs the managed venv when safe (may run uv sync --reinstall).
EOF
}

backend_dir() {
  printf '%s/backend\n' "$repo_root"
}

venv_dir() {
  printf '%s/backend/.venv\n' "$repo_root"
}

venv_bin_dir() {
  printf '%s/bin\n' "$(venv_dir)"
}

expected_venv_prefix() {
  local backend_real
  backend_real="$(cd "$(backend_dir)" && pwd -P)"
  printf '%s/.venv\n' "$backend_real"
}

backend_runtime_applicable() {
  [[ -f "$(backend_dir)/pyproject.toml" ]]
}

VENV_UNSAFE_REASON=''

# Returns 0 when backend/.venv is a regular directory inside this worktree's backend/.
prove_ordinary_in_tree_venv() {
  local venv_path backend_real venv_real expected
  VENV_UNSAFE_REASON=''
  venv_path="$(venv_dir)"
  [[ -e "$venv_path" ]] || return 1
  if [[ -L "$venv_path" ]]; then
    VENV_UNSAFE_REASON='symlink'
    return 2
  fi
  [[ -d "$venv_path" ]] || return 1
  backend_real="$(cd "$(backend_dir)" && pwd -P)"
  venv_real="$(cd "$venv_path" && pwd -P)"
  expected="$backend_real/.venv"
  if [[ "$venv_real" != "$expected" ]]; then
    VENV_UNSAFE_REASON='outside'
    return 2
  fi
  return 0
}

read_uvicorn_shebang() {
  local uvicorn_path="$1"
  [[ -f "$uvicorn_path" ]] || return 1
  head -n 1 "$uvicorn_path"
}

interpreter_prefix_matches() {
  local python_path expected actual
  python_path="$(venv_bin_dir)/python"
  [[ -x "$python_path" ]] || return 1
  expected="$(expected_venv_prefix)"
  actual="$("$python_path" -c 'import sys; print(sys.prefix)' 2>/dev/null)" || return 1
  actual="$(cd "$actual" && pwd -P)"
  [[ "$actual" == "$expected" ]]
}

uvicorn_shebang_matches() {
  local uvicorn_path expected_python shebang
  uvicorn_path="$(venv_bin_dir)/uvicorn"
  [[ -f "$uvicorn_path" ]] || return 1
  expected_python="$(cd "$(venv_bin_dir)" && pwd -P)/python"
  shebang="$(read_uvicorn_shebang "$uvicorn_path")"
  [[ "$shebang" == "#!$expected_python" ]]
}

venv_paths_stale() {
  local proof_status=0
  prove_ordinary_in_tree_venv >/dev/null || proof_status=$?
  if [[ "$proof_status" -eq 1 ]]; then
    return 1
  fi
  if [[ "$proof_status" -eq 2 ]]; then
    return 0
  fi
  if ! interpreter_prefix_matches; then
    return 0
  fi
  if ! uvicorn_shebang_matches; then
    return 0
  fi
  return 1
}

venv_healthy() {
  prove_ordinary_in_tree_venv >/dev/null || return 1
  [[ -x "$(venv_bin_dir)/python" ]] || return 1
  [[ -f "$(venv_bin_dir)/uvicorn" ]] || return 1
  interpreter_prefix_matches && uvicorn_shebang_matches
}

print_missing_venv_recovery() {
  printf '[backend-venv] Managed backend/.venv is missing.\n'
  printf '[backend-venv] Run: bash scripts/worktree.sh setup %s\n' "$repo_root"
  printf '[backend-venv] Or install manually: uv sync --directory %s/backend\n' "$repo_root"
}

print_unsafe_venv_recovery() {
  local reason="$1"
  case "$reason" in
    symlink)
      printf '[backend-venv] backend/.venv is a symlink; automatic repair is unsafe.\n'
      printf '[backend-venv] Inspect the symlink target, replace it with a regular directory if appropriate, then run:\n'
      printf '[backend-venv]   bash scripts/worktree.sh setup %s\n' "$repo_root"
      ;;
    outside)
      printf '[backend-venv] backend/.venv is not an ordinary directory inside this worktree.\n'
      printf '[backend-venv] Inspect the path manually, then run:\n'
      printf '[backend-venv]   bash scripts/worktree.sh setup %s\n' "$repo_root"
      ;;
    *)
      printf '[backend-venv] backend/.venv cannot be repaired automatically.\n'
      printf '[backend-venv] Run: bash scripts/worktree.sh setup %s\n' "$repo_root"
      ;;
  esac
}

print_stale_recovery() {
  printf '[backend-venv] Managed backend/.venv has stale absolute paths (common after moving a worktree).\n'
  printf '[backend-venv] Run: bash scripts/worktree.sh setup %s\n' "$repo_root"
  printf '[backend-venv] Setup may run: uv sync --reinstall --directory %s/backend\n' "$repo_root"
}

verify_uvicorn_executable() {
  local uvicorn_path
  uvicorn_path="$(venv_bin_dir)/uvicorn"
  [[ -x "$uvicorn_path" ]] || die "uvicorn is not executable: $uvicorn_path"
  uvicorn_shebang_matches || die "uvicorn shebang does not match the managed interpreter: $uvicorn_path"
  "$uvicorn_path" --version >/dev/null || die "uvicorn could not be executed: $uvicorn_path"
}

repair_stale_managed_venv() {
  local proof_status=0
  prove_ordinary_in_tree_venv >/dev/null || proof_status=$?
  if [[ "$proof_status" -eq 2 ]]; then
    print_unsafe_venv_recovery "${VENV_UNSAFE_REASON:-unknown}"
    die 'Refusing to repair an unsafe backend virtualenv.'
  fi
  if [[ "$proof_status" -ne 0 ]]; then
    die 'Managed backend/.venv is missing.'
  fi
  if ! venv_paths_stale; then
    verify_uvicorn_executable
    return 0
  fi
  printf '[backend-venv] Repairing stale managed backend/.venv with uv sync --reinstall\n'
  uv sync --reinstall --directory "$(backend_dir)"
  venv_healthy || die 'Backend virtualenv is still unhealthy after reinstall.'
  verify_uvicorn_executable
  printf '[backend-venv] Backend virtualenv is healthy.\n'
}

ensure_backend_runtime() {
  if ! backend_runtime_applicable; then
    return 0
  fi
  if [[ -L "$(venv_dir)" ]]; then
    print_unsafe_venv_recovery symlink
    die 'Refusing to sync an unsafe backend virtualenv.'
  fi
  if [[ ! -e "$(venv_dir)" ]]; then
    printf '[backend-venv] Creating managed backend/.venv with uv sync\n'
    uv sync --directory "$(backend_dir)"
    venv_healthy || die 'Backend virtualenv is unhealthy after initial uv sync.'
    verify_uvicorn_executable
    printf '[backend-venv] Backend virtualenv is healthy.\n'
    return 0
  fi
  repair_stale_managed_venv
}

preflight_backend_runtime() {
  if ! backend_runtime_applicable; then
    return 0
  fi
  if [[ ! -e "$(venv_dir)" ]]; then
    print_missing_venv_recovery
    exit 2
  fi
  local proof_status=0
  prove_ordinary_in_tree_venv >/dev/null || proof_status=$?
  if [[ "$proof_status" -eq 2 ]]; then
    print_unsafe_venv_recovery "${VENV_UNSAFE_REASON:-unknown}"
    exit 2
  fi
  if [[ "$proof_status" -ne 0 ]]; then
    print_missing_venv_recovery
    exit 2
  fi
  if venv_paths_stale || ! venv_healthy; then
    print_stale_recovery
    exit 2
  fi
  verify_uvicorn_executable
}

repo_root=''
command_name="${1:-}"
[[ -n "$command_name" ]] || { usage >&2; exit 2; }
shift

case "$command_name" in
  preflight | ensure)
    [[ $# -eq 1 ]] || die "Usage: scripts/backend-venv.sh $command_name <repo-root>"
    repo_root="$(cd "$1" && pwd -P)"
    ;;
  -h | --help | help)
    usage
    exit 0
    ;;
  *)
    die "Unknown command: $command_name"
    ;;
esac

case "$command_name" in
  preflight) preflight_backend_runtime ;;
  ensure) ensure_backend_runtime ;;
esac
