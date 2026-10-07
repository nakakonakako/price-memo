#!/usr/bin/env bash
set -euo pipefail

FRONTEND_PORT=5273
BACKEND_PORT=8001
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"

usage() {
  cat <<'EOF'
Usage:
  scripts/cursor-devserver.sh ensure
  scripts/cursor-devserver.sh stop
  scripts/cursor-devserver.sh status

Commands:
  ensure  Start or reuse price-memo frontend (:5273) and backend (:8001).
          Refuses unrelated port occupants. Records only processes started here.
  stop    Stop process groups started by the latest ensure in this worktree.
  status  Show port occupancy and whether each service is price-memo.
EOF
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Not inside a Git repository." >&2
  exit 2
}
cd "$repo_root"

state_base="${XDG_STATE_HOME:-$HOME/.local/state}/price-memo/cursor-devserver"

worktree_key() {
  local git_dir
  git_dir="$(git rev-parse --git-dir)"
  if [[ "$git_dir" == *"/worktrees/"* ]]; then
    basename "$git_dir"
  else
    printf '%s' "$(git rev-parse --show-toplevel)" | sha256sum | awk '{print $1}' | cut -c1-16
  fi
}

state_dir="$state_base/$(worktree_key)"
session_file="$state_dir/session.json"
log_dir="$state_dir/logs"

process_starttime() {
  local pid="$1" stat rest
  [[ "$pid" =~ ^[0-9]+$ && -r "/proc/${pid}/stat" ]] || return 1
  stat="$(<"/proc/${pid}/stat")"
  rest="${stat##*) }"
  awk '{print $20}' <<<"$rest"
}

port_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :${port}" 2>/dev/null | grep -q LISTEN
    return
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return
  fi
  curl -sf --max-time 1 "http://127.0.0.1:${port}/" >/dev/null 2>&1
}

probe_backend() {
  local body
  body="$(curl -sf --max-time 3 "${BACKEND_URL}/" 2>/dev/null)" || return 1
  python3 -c 'import json,sys
try:
    payload=json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
sys.exit(0 if payload == {"message":"price-memo API is running.","feature":"B"} else 1)' "$body"
}

probe_frontend() {
  local body
  body="$(curl -sf --max-time 3 "${FRONTEND_URL}/" 2>/dev/null)" || return 1
  [[ "$body" == *"<title>単価メモ</title>"* && "$body" == *"/src/main.tsx"* ]]
}

wait_for_backend() {
  local attempt=0
  while (( attempt < 60 )); do
    if probe_backend; then
      return 0
    fi
    sleep 0.5
    attempt=$((attempt + 1))
  done
  echo "[cursor-devserver] backend did not become ready on :${BACKEND_PORT}" >&2
  return 1
}

wait_for_frontend() {
  local attempt=0
  while (( attempt < 60 )); do
    if probe_frontend; then
      return 0
    fi
    sleep 0.5
    attempt=$((attempt + 1))
  done
  echo "[cursor-devserver] frontend did not become ready on :${FRONTEND_PORT}" >&2
  return 1
}

write_session() {
  mkdir -p "$state_dir"
  printf '%s\n' "$1" >"$session_file"
}

start_backend() {
  mkdir -p "$log_dir"
  read -r started_pid started_pgid < <(python3 - "$repo_root/backend" "$log_dir/backend.log" "$BACKEND_PORT" <<'PY'
import subprocess
import sys

cwd, log_path, port = sys.argv[1:]
log = open(log_path, "ab")
process = subprocess.Popen(
    ["uv", "run", "uvicorn", "app.main:app", "--reload", "--port", port],
    cwd=cwd,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(process.pid, process.pid)
PY
  )
  [[ -n "$started_pid" && "$started_pgid" == "$started_pid" ]]
}

start_frontend() {
  mkdir -p "$log_dir"
  read -r started_pid started_pgid < <(python3 - "$repo_root" "$log_dir/frontend.log" <<'PY'
import subprocess
import sys

cwd, log_path = sys.argv[1:]
log = open(log_path, "ab")
process = subprocess.Popen(
    ["npm", "run", "dev:playwright", "--prefix", "frontend"],
    cwd=cwd,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(process.pid, process.pid)
PY
  )
  [[ -n "$started_pid" && "$started_pgid" == "$started_pid" ]]
}

cmd_ensure() {
  mkdir -p "$state_dir" "$log_dir"
  if [[ -f "$session_file" ]]; then
    echo "[cursor-devserver] an existing session is recorded for this worktree; run npm run devserver:stop first" >&2
    exit 1
  fi
  local started_pids=() started_pgids=() started_starttimes=()
  cleanup_started() {
    local index
    for ((index = ${#started_pids[@]} - 1; index >= 0; index--)); do
      stop_process_group "${started_pids[index]}" "${started_pgids[index]}" "${started_starttimes[index]}"
    done
  }
  trap cleanup_started ERR
  trap 'cleanup_started; exit 130' INT
  trap 'cleanup_started; exit 143' TERM
  local started_at wt_key
  started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  wt_key="$(worktree_key)"

  local started_backend=0 started_frontend=0
  local backend_pid="" backend_pgid="" frontend_pid="" frontend_pgid=""
  local backend_starttime="" frontend_starttime=""

  if port_listening "$BACKEND_PORT"; then
    if probe_backend; then
      echo "[cursor-devserver] reusing backend on :${BACKEND_PORT}"
    else
      echo "[cursor-devserver] error: port ${BACKEND_PORT} is occupied by an unrelated process" >&2
      exit 1
    fi
  else
    start_backend
    backend_pid="$started_pid"
    backend_pgid="$started_pgid"
    backend_starttime="$(process_starttime "$backend_pid")"
    started_backend=1
    started_pids+=("$backend_pid")
    started_pgids+=("$backend_pgid")
    started_starttimes+=("$backend_starttime")
    echo "[cursor-devserver] started backend pid=${backend_pid} pgid=${backend_pgid}"
    wait_for_backend
  fi

  if port_listening "$FRONTEND_PORT"; then
    if probe_frontend; then
      echo "[cursor-devserver] reusing frontend on :${FRONTEND_PORT}"
    else
      echo "[cursor-devserver] error: port ${FRONTEND_PORT} is occupied by an unrelated process" >&2
      if (( started_backend )); then
        kill -TERM "-${backend_pgid}" 2>/dev/null || true
      fi
      exit 1
    fi
  else
    start_frontend
    frontend_pid="$started_pid"
    frontend_pgid="$started_pgid"
    frontend_starttime="$(process_starttime "$frontend_pid")"
    started_frontend=1
    started_pids+=("$frontend_pid")
    started_pgids+=("$frontend_pgid")
    started_starttimes+=("$frontend_starttime")
    echo "[cursor-devserver] started frontend pid=${frontend_pid} pgid=${frontend_pgid}"
    wait_for_frontend
  fi

  local session_json
  session_json="$(node - \
    "$started_at" "$wt_key" \
    "$started_backend" "$backend_pid" "$backend_pgid" "$backend_starttime" \
    "$started_frontend" "$frontend_pid" "$frontend_pgid" "$frontend_starttime" <<'NODE'
const crypto = require('node:crypto');
const [
  ,
  ,
  startedAt,
  worktreeKey,
  startedBackend,
  backendPid,
  backendPgid,
  backendStarttime,
  startedFrontend,
  frontendPid,
  frontendPgid,
  frontendStarttime,
] = process.argv;

const processes = [];
if (startedBackend === '1') {
  processes.push({
    name: 'backend',
    pid: Number(backendPid),
    pgid: Number(backendPgid),
    starttime: backendStarttime,
  });
}
if (startedFrontend === '1') {
  processes.push({
    name: 'frontend',
    pid: Number(frontendPid),
    pgid: Number(frontendPgid),
    starttime: frontendStarttime,
  });
}

process.stdout.write(JSON.stringify({
  session_id: crypto.randomUUID(),
  started_at: startedAt,
  worktree_key: worktreeKey,
  started: {
    backend: startedBackend === '1',
    frontend: startedFrontend === '1',
  },
  processes,
}, null, 2));
NODE
)"
  write_session "$session_json"
  trap - ERR INT TERM

  echo "[cursor-devserver] frontend: ${FRONTEND_URL}"
  echo "[cursor-devserver] backend:  ${BACKEND_URL}"
  echo "[cursor-devserver] session:  $session_file"
}

stop_process_group() {
  local pid="$1" pgid="$2" expected_starttime="$3"
  if [[ -z "$pid" || -z "$pgid" || -z "$expected_starttime" ]]; then
    return 0
  fi
  local current_starttime current_pgid
  current_starttime="$(process_starttime "$pid" 2>/dev/null || true)"
  current_pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  if [[ "$current_starttime" != "$expected_starttime" || "$current_pgid" != "$pgid" ]]; then
    echo "[cursor-devserver] leaving pid ${pid} alone because it no longer matches the process started by this helper"
    return 0
  fi
  if kill -0 "-${pgid}" 2>/dev/null; then
    kill -TERM "-${pgid}" 2>/dev/null || true
    sleep 1
    if kill -0 "-${pgid}" 2>/dev/null; then
      kill -KILL "-${pgid}" 2>/dev/null || true
    fi
  fi
}

cmd_stop() {
  if [[ ! -f "$session_file" ]]; then
    echo "[cursor-devserver] no session to stop for worktree $(worktree_key)" >&2
    exit 0
  fi

  local processes_count
  processes_count="$(node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(String((s.processes||[]).length));' "$session_file")"

  if [[ "$processes_count" == "0" ]]; then
    echo "[cursor-devserver] nothing started by the latest ensure; reused services were left running"
    rm -f "$session_file"
    exit 0
  fi

  node -e '
const fs = require("fs");
const session = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const proc of session.processes || []) {
  console.log(`[cursor-devserver] stopping ${proc.name} pgid=${proc.pgid}`);
}
' "$session_file"

  while IFS=$'\t' read -r pid pgid starttime; do
    [[ -n "$pid" && -n "$pgid" && -n "$starttime" ]] && stop_process_group "$pid" "$pgid" "$starttime"
  done < <(node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); for (const p of (s.processes||[])) process.stdout.write(`${p.pid}\t${p.pgid}\t${p.starttime}\n`);' "$session_file")

  rm -f "$session_file"
  echo "[cursor-devserver] stopped processes started by the latest ensure"
}

cmd_status() {
  echo "[cursor-devserver] worktree: $(worktree_key)"
  echo "[cursor-devserver] state:    $state_dir"
  if port_listening "$BACKEND_PORT"; then
    if probe_backend; then
      echo "[cursor-devserver] backend :${BACKEND_PORT} listening (price-memo)"
    else
      echo "[cursor-devserver] backend :${BACKEND_PORT} listening (unrelated)"
    fi
  else
    echo "[cursor-devserver] backend :${BACKEND_PORT} free"
  fi
  if port_listening "$FRONTEND_PORT"; then
    if probe_frontend; then
      echo "[cursor-devserver] frontend :${FRONTEND_PORT} listening (vite)"
    else
      echo "[cursor-devserver] frontend :${FRONTEND_PORT} listening (unrelated)"
    fi
  else
    echo "[cursor-devserver] frontend :${FRONTEND_PORT} free"
  fi
  if [[ -f "$session_file" ]]; then
    echo "[cursor-devserver] latest session:"
    cat "$session_file"
  else
    echo "[cursor-devserver] latest session: none"
  fi
}

command="${1:-}"
case "$command" in
  ensure) cmd_ensure ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  -h|--help|"") usage; [[ -z "$command" ]] && exit 2 ;;
  *) echo "Unknown command: $command" >&2; usage >&2; exit 2 ;;
esac
