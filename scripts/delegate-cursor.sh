#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/delegate-cursor.sh [--tier <light|normal|hard>] --task-file <path> [--worktree <name>]
  scripts/delegate-cursor.sh [--tier <light|normal|hard>] --prompt <text> [--worktree <name>]
  scripts/delegate-cursor.sh --fallback-tier <light|normal> --task-file <path> [--worktree <name>]
  scripts/delegate-cursor.sh --fallback-tier <light|normal> --task-file <path> --continue-worktree <path>
  scripts/delegate-cursor.sh --model-override gpt-5.6-luna-medium --task-file <path>

Options:
  --tier        Cursor model tier. Default: light
  --fallback-tier  Explicit Other Models route (Supervisor decision only).
  --model-override Explicit reserve model; currently gpt-5.6-luna-medium only.
  --task-file   Read the work order from a file.
  --prompt      Pass the work order directly.
  --worktree    Create and run in an isolated Git worktree.
  --continue-worktree  Continue in an existing worktree after reviewing its diff.
  --allow-dirty Allow direct execution in a dirty current checkout.
  -h, --help    Show this help.

Model mapping:
  light  -> composer-2.5 (default)
  normal -> grok-4.7-medium
  hard   -> grok-4.7-high

Explicit Other Models mapping (no automatic quota detection or retry):
  fallback light -> gemini-3.8-flash-low
  fallback normal -> claude-sonnet-5-5-medium
  model override -> gpt-5.6-luna-medium (reserve)
EOF
}

tier="light"
fallback_tier=""
model_override=""
task_file=""
prompt=""
worktree=""
continue_worktree=""
allow_dirty=0
tier_was_set=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) tier="${2:?missing value for --tier}"; tier_was_set=1; shift 2 ;;
    --fallback-tier) fallback_tier="${2:?missing value for --fallback-tier}"; shift 2 ;;
    --model-override) model_override="${2:?missing value for --model-override}"; shift 2 ;;
    --task-file) task_file="${2:?missing value for --task-file}"; shift 2 ;;
    --prompt) prompt="${2:?missing value for --prompt}"; shift 2 ;;
    --worktree) worktree="${2:?missing value for --worktree}"; shift 2 ;;
    --continue-worktree) continue_worktree="${2:?missing value for --continue-worktree}"; shift 2 ;;
    --allow-dirty) allow_dirty=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

route="cursor"
if [[ -n "$fallback_tier" && ( "$tier_was_set" -eq 1 || -n "$model_override" ) ]]; then
  echo "--fallback-tier cannot be combined with --tier or --model-override." >&2
  exit 2
fi
if [[ -n "$model_override" && "$tier_was_set" -eq 1 ]]; then
  echo "--model-override cannot be combined with --tier." >&2
  exit 2
fi
if [[ -n "$fallback_tier" ]]; then
  route="other-models"
  case "$fallback_tier" in
    light) model="gemini-3.8-flash-low" ;;
    normal) model="claude-sonnet-5-5-medium" ;;
    *) echo "Invalid fallback tier: $fallback_tier (expected light or normal)" >&2; exit 2 ;;
  esac
  tier="fallback-$fallback_tier"
elif [[ -n "$model_override" ]]; then
  route="other-models-reserve"
  case "$model_override" in
    gpt-5.6-luna-medium) model="$model_override" ;;
    *) echo "Unsupported model override: $model_override (allowed: gpt-5.6-luna-medium)" >&2; exit 2 ;;
  esac
  tier="model-override"
else
  case "$tier" in
    light)  model="composer-2.5" ;;
    normal) model="grok-4.7-medium" ;;
    hard)   model="grok-4.7-high" ;;
    *) echo "Invalid tier: $tier (expected light, normal, or hard)" >&2; exit 2 ;;
  esac
fi

if [[ -n "$worktree" && -n "$continue_worktree" ]]; then
  echo "Use either --worktree or --continue-worktree, not both." >&2
  exit 2
fi
if [[ -n "$continue_worktree" && "$route" == "cursor" ]]; then
  echo "--continue-worktree is reserved for an explicitly selected Other Models route." >&2
  exit 2
fi

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
origin_root="$repo_root"
if [[ -n "$continue_worktree" ]]; then
  if [[ ! -d "$continue_worktree" ]]; then
    echo "Existing worktree not found: $continue_worktree" >&2
    exit 2
  fi
  continue_worktree="$(cd "$continue_worktree" && pwd -P)"
  if ! git -C "$continue_worktree" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not a Git worktree: $continue_worktree" >&2
    exit 2
  fi
  origin_common="$(git -C "$origin_root" rev-parse --path-format=absolute --git-common-dir)"
  target_common="$(git -C "$continue_worktree" rev-parse --path-format=absolute --git-common-dir)"
  if [[ "$origin_common" != "$target_common" ]]; then
    echo "Worktree belongs to a different repository: $continue_worktree" >&2
    exit 2
  fi
  repo_root="$(git -C "$continue_worktree" rev-parse --show-toplevel)"
fi
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

if [[ -z "$worktree" && -z "$continue_worktree" && "$allow_dirty" -ne 1 && -n "$(git status --porcelain)" ]]; then
  cat >&2 <<'EOF'
Current checkout has uncommitted changes.
Refusing to run Cursor directly because its edits could mix with existing work.

Use one of:
  --worktree <name>   (recommended)
  --allow-dirty       (only when mixing changes is intentional)
EOF
  exit 3
fi

if [[ -n "$continue_worktree" ]]; then
  work_order="$(printf '%s\n\n%s' 'CONTINUATION REQUIREMENT: This is an existing worktree that may contain partial work from a previous worker. Before editing, inspect git status --short, staged and unstaged diffs, and relevant untracked files. Explain what is already changed, preserve all existing work, and continue the same work order in this worktree. Do not reset, checkout, stash, clean, or revert existing changes. If the existing diff is ambiguous or conflicts with the work order, stop and report it to the supervisor.' "$work_order")"
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
If unable to complete, state whether the evidence points to implementation difficulty or tooling/environment failure. Do not change models or initiate a retry in another model pool.
EOF

full_prompt="${supervisor_prefix}

WORK ORDER
==========
${work_order}"

cmd=(agent --approve-mcps --trust --model "$model")
if [[ -n "$worktree" ]]; then
  cmd+=(--worktree "$worktree")
fi
if [[ -n "$continue_worktree" ]]; then
  cmd+=(--workspace "$continue_worktree")
fi
echo "[delegate-cursor] repo: $repo_root" >&2
echo "[delegate-cursor] route: $route" >&2
echo "[delegate-cursor] tier: $tier" >&2
echo "[delegate-cursor] model: $model" >&2
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "[delegate-cursor] started_at: $started_at" >&2
if [[ -n "$worktree" ]]; then
  echo "[delegate-cursor] worktree: $worktree" >&2
elif [[ -n "$continue_worktree" ]]; then
  echo "[delegate-cursor] worktree: continue $continue_worktree" >&2
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
