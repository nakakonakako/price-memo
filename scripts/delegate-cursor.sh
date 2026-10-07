#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/delegate-cursor.sh [--tier <light|normal|hard>] --task-file <path> [--worktree <name>]
  scripts/delegate-cursor.sh [--tier <light|normal|hard>] --prompt <text> [--worktree <name>]

Options:
  --tier        Cursor model tier. Default: light
  --task-file   Read the work order from a file.
  --prompt      Pass the work order directly.
  --worktree    Run Cursor in an isolated Git worktree.
  --allow-dirty Allow direct execution in a dirty current checkout.
  -h, --help    Show this help.

Model mapping:
  light  -> composer-2.5 (default)
  normal -> grok-4.7-medium
  hard   -> grok-4.7-high
EOF
}

tier="light"
task_file=""
prompt=""
worktree=""
allow_dirty=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) tier="${2:?missing value for --tier}"; shift 2 ;;
    --task-file) task_file="${2:?missing value for --task-file}"; shift 2 ;;
    --prompt) prompt="${2:?missing value for --prompt}"; shift 2 ;;
    --worktree) worktree="${2:?missing value for --worktree}"; shift 2 ;;
    --allow-dirty) allow_dirty=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$tier" in
  light)  model="composer-2.5" ;;
  normal) model="grok-4.7-medium" ;;
  hard)   model="grok-4.7-high" ;;
  *) echo "Invalid tier: $tier (expected light, normal, or hard)" >&2; exit 2 ;;
esac

if [[ -n "$task_file" && -n "$prompt" ]]; then
  echo "Use either --task-file or --prompt, not both." >&2
  exit 2
fi

if [[ -z "$task_file" && -z "$prompt" ]]; then
  echo "A work order is required via --task-file or --prompt." >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Not inside a Git repository." >&2
  exit 2
}
cd "$repo_root"

if [[ -n "$task_file" ]]; then
  if [[ ! -f "$task_file" ]]; then
    echo "Task file not found: $task_file" >&2
    exit 2
  fi
  work_order="$(cat "$task_file")"
else
  work_order="$prompt"
fi

if [[ -z "$worktree" && "$allow_dirty" -ne 1 && -n "$(git status --porcelain)" ]]; then
  cat >&2 <<'EOF'
Current checkout has uncommitted changes.
Refusing to run Cursor directly because its edits could mix with existing work.

Use one of:
  --worktree <name>   (recommended)
  --allow-dirty       (only when mixing changes is intentional)
EOF
  exit 3
fi

read -r -d '' supervisor_prefix <<'EOF' || true
You are a Cursor implementation worker delegated by a supervisor.

Follow AGENTS.md and the repository's .cursor rules.
Stay within the supplied work order and the price-memo repository.
Do not broaden scope or perform unrelated refactors.
Preserve exact weight, quantity, and volume semantics; never treat guessed values as confirmed.
Do not add household expense management.
Never create, keep, or apply migrations from price-memo, and never run a database push.
Do not edit receipt-manager or any other repository from this worker task; stop and report cross-repository or schema needs to the supervisor.
If the task unexpectedly requires database/schema changes, auth/security changes,
public API contract changes, CI/CD or deployment changes, cross-repository changes,
or an undocumented architecture decision, stop that part and report it for supervisor review.

After implementation, run the repository-standard verification (normally `npm run check`).
For UI/browser behavior, use Playwright MCP when it materially verifies the acceptance criteria.

End with:
1. root cause / implementation intent
2. changed files
3. verification performed and results
4. remaining risks
5. supervisor decisions required
If unable to complete, state whether the evidence points to implementation difficulty or tooling/environment failure. Report a Cursor Models usage/quota limit only when the CLI provides a structured quota-specific signal; otherwise say unclassified. Do not switch to an Other Models model or retry in another model pool.
EOF

full_prompt="${supervisor_prefix}

WORK ORDER
==========
${work_order}"

cmd=(agent --approve-mcps --trust --model "$model")
if [[ -n "$worktree" ]]; then
  cmd+=(--worktree "$worktree")
fi
echo "[delegate-cursor] repo: $repo_root" >&2
echo "[delegate-cursor] tier: $tier" >&2
echo "[delegate-cursor] model: $model" >&2
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "[delegate-cursor] started_at: $started_at" >&2
if [[ -n "$worktree" ]]; then
  echo "[delegate-cursor] worktree: $worktree" >&2
else
  echo "[delegate-cursor] worktree: direct checkout" >&2
fi

log_dir="$(mktemp -d "${TMPDIR:-/tmp}/delegate-cursor.XXXXXX")"
stdout_log="$log_dir/stdout.log"
stderr_log="$log_dir/stderr.log"
echo "[delegate-cursor] stdout log: $stdout_log" >&2
echo "[delegate-cursor] stderr log: $stderr_log" >&2

# stream-json makes the terminal output inspectable and gives the supervisor a
# structured final result event. Keep stdout and stderr visible and separately
# captured so CLI/worktree diagnostics are not lost.
cmd+=(--output-format stream-json -p "$full_prompt")
exec {stderr_fd}> >(tee "$stderr_log" >&2)
stderr_tee_pid=$!
set +e
"${cmd[@]}" \
  2>&"$stderr_fd" | tee "$stdout_log"
pipeline_status=("${PIPESTATUS[@]}")
agent_exit_code="${pipeline_status[0]}"
set -e
exec {stderr_fd}>&-
wait "$stderr_tee_pid" || true

result_status="missing"
result_event=""
if result_event="$(node - "$stdout_log" <<'NODE'
const fs = require('node:fs');
const logPath = process.argv[2];
let finalResult;
for (const line of fs.readFileSync(logPath, 'utf8').split(/\r?\n/)) {
  try {
    const event = JSON.parse(line);
    if (event && event.type === 'result') finalResult = event;
  } catch {
    // Ignore non-JSON lines so diagnostic text remains usable as well.
  }
}
if (finalResult) {
  process.stdout.write(JSON.stringify({
    type: finalResult.type,
    subtype: finalResult.subtype,
    is_error: finalResult.is_error,
    session_id: finalResult.session_id,
  }));
}
NODE
)" && [[ -n "$result_event" ]]; then
  result_status="unknown"
  if node -e 'const e=JSON.parse(process.argv[1]); process.exit(e.subtype === "success" || (e.is_error === false && e.subtype !== "error") ? 0 : 1)' "$result_event"; then
    result_status="success"
  elif node -e 'const e=JSON.parse(process.argv[1]); process.exit(e.subtype === "error" || e.is_error === true ? 0 : 1)' "$result_event"; then
    result_status="error"
  fi
fi

failure_stage="none"
if [[ "$agent_exit_code" -ne 0 || "$result_status" == "error" ]]; then
  if [[ -n "$worktree" ]] && { grep -Eiq 'worktree setup (failed|error)|setup script.*(failed|error)|failed.*setup' "$stderr_log" "$stdout_log" || { grep -Eiq 'Running worktree setup script' "$stderr_log" "$stdout_log" && ! grep -Eiq '\[worktree-setup\] Complete\.' "$stderr_log" "$stdout_log"; }; }; then
    failure_stage="worktree_setup"
  elif [[ -n "$worktree" ]] && grep -Eiq '(fatal:.*worktree|Error:.*(worktree|mkdir)|unable to create.*worktree|failed to create.*worktree)' "$stderr_log" "$stdout_log"; then
    failure_stage="worktree_creation"
  else
    failure_stage="cursor_agent_unclassified"
  fi
elif [[ "$agent_exit_code" -eq 0 && "$result_status" == "success" ]]; then
  failure_stage="success"
else
  failure_stage="cursor_agent_unclassified"
fi

finished_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "[delegate-cursor] finished_at: $finished_at" >&2
echo "[delegate-cursor] process_exit_code: $agent_exit_code" >&2
echo "[delegate-cursor] result_event_status: $result_status" >&2
if [[ -n "$result_event" ]]; then
  echo "[delegate-cursor] final_result_event: $result_event" >&2
fi
echo "[delegate-cursor] outcome: $failure_stage" >&2
if [[ "$agent_exit_code" -eq 0 && "$result_status" == "success" ]]; then
  rm -rf -- "$log_dir"
  echo "[delegate-cursor] logs: removed after successful completion" >&2
else
  echo "[delegate-cursor] logs: $log_dir" >&2
fi

if [[ "$agent_exit_code" -ne 0 ]]; then
  exit "$agent_exit_code"
fi
if [[ "$result_status" != "success" ]]; then
  exit 1
fi
