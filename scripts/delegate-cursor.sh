#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/delegate-cursor.sh [--tier <light|normal|hard>] --task-file <path> [--worktree <task-name> | --workspace <path>] [--trust|--no-trust]
  scripts/delegate-cursor.sh [--tier <light|normal|hard>] --prompt <text> [--worktree <task-name> | --workspace <path>] [--trust|--no-trust]
  scripts/delegate-cursor.sh --fallback-tier <light|normal> --task-file <path> [--worktree <task-name> | --workspace <path>]
  scripts/delegate-cursor.sh --model-override gpt-5.6-luna-medium --task-file <path>

Options:
  --tier        Cursor model tier. Default: light
  --fallback-tier  Explicit Other Models route (Supervisor decision only).
  --model-override Explicit reserve model; currently gpt-5.6-luna-medium only.
  --task-file   Read the work order from a file.
  --prompt      Pass the work order directly.
  --worktree    Create or reuse ~/worktrees/<repository>/<task> with Git, then pass it through --workspace.
  --workspace   Reuse an existing worktree after showing its changes and running setup.
  --continue-worktree  Compatibility alias for --workspace.
  --allow-dirty Allow direct execution in a dirty current checkout.
  --trust       Trust the workspace (enabled by default).
  --no-trust    Disable workspace trust for this invocation.
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
workspace=""
allow_dirty=0
trust=1
tier_was_set=0
fallback_was_set=0
override_was_set=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) tier="${2:?missing value for --tier}"; tier_was_set=1; shift 2 ;;
    --fallback-tier)
      [[ "$fallback_was_set" -eq 0 ]] || { echo "--fallback-tier may be specified only once." >&2; exit 2; }
      fallback_tier="${2:?missing value for --fallback-tier}"
      fallback_was_set=1
      shift 2
      ;;
    --model-override)
      [[ "$override_was_set" -eq 0 ]] || { echo "--model-override may be specified only once." >&2; exit 2; }
      model_override="${2:?missing value for --model-override}"
      override_was_set=1
      shift 2
      ;;
    --task-file) task_file="${2:?missing value for --task-file}"; shift 2 ;;
    --prompt) prompt="${2:?missing value for --prompt}"; shift 2 ;;
    --worktree) worktree="${2:?missing value for --worktree}"; shift 2 ;;
    --workspace|--continue-worktree) workspace="${2:?missing value for --workspace}"; shift 2 ;;
    --allow-dirty) allow_dirty=1; shift ;;
    --trust) trust=1; shift ;;
    --no-trust) trust=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

route="cursor"
if [[ "$fallback_was_set" -eq 1 && ( "$tier_was_set" -eq 1 || "$override_was_set" -eq 1 ) ]]; then
  echo "--fallback-tier cannot be combined with --tier or --model-override." >&2
  exit 2
fi
if [[ "$override_was_set" -eq 1 && "$tier_was_set" -eq 1 ]]; then
  echo "--model-override cannot be combined with --tier." >&2
  exit 2
fi
if [[ "$fallback_was_set" -eq 1 ]]; then
  route="other-models"
  case "$fallback_tier" in
    light) model="gemini-3.8-flash-low" ;;
    normal) model="claude-sonnet-5-5-medium" ;;
    *) echo "Invalid fallback tier: $fallback_tier (expected light or normal)" >&2; exit 2 ;;
  esac
  tier="fallback-$fallback_tier"
elif [[ "$override_was_set" -eq 1 ]]; then
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

if [[ -n "$worktree" && -n "$workspace" ]]; then
  echo "Use either --worktree or --workspace, not both." >&2
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

# Preserve relative --task-file semantics independently from launcher origin:
# resolve it against the caller's repository before switching to a workspace.
caller_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
caller_root="$(cd "$caller_root" && pwd -P)"

launcher_path="$(readlink -f -- "${BASH_SOURCE[0]}" 2>/dev/null)" || {
  echo "Cannot resolve the launcher path; run it from a readable Git checkout." >&2
  exit 2
}
launcher_dir="$(dirname "$launcher_path")"
origin_root="$(git -C "$launcher_dir" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Cannot determine the Git checkout containing the launcher: $launcher_path" >&2
  exit 2
}
origin_root="$(cd "$origin_root" && pwd -P)"
repo_root="$origin_root"
cd "$repo_root"

# The Supervisor refreshes origin/main before delegation. Read only the local
# remote-tracking ref here; this launcher never fetches or changes a checkout.
source_head="$(git -C "$origin_root" rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || {
  echo "Cannot determine launcher checkout HEAD; refusing to delegate." >&2
  exit 2
}
source_branch="$(git -C "$origin_root" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ -z "$source_branch" ]]; then
  source_branch="(detached HEAD)"
fi
baseline_ref="origin/main"
baseline_sha="$(git -C "$origin_root" rev-parse --verify 'refs/remotes/origin/main^{commit}' 2>/dev/null)" || {
  cat >&2 <<EOF
Cannot verify the local origin/main baseline from launcher checkout $origin_root.
Launcher HEAD: $source_head
No valid origin/main commit ref is available. Fetch origin/main explicitly, then retry; the launcher does not fetch automatically.
EOF
  exit 2
}
if [[ "$source_branch" == "main" && "$source_head" != "$baseline_sha" ]]; then
  if git -C "$origin_root" merge-base --is-ancestor "$source_head" "$baseline_sha"; then
    source_relation="stale"
  elif git -C "$origin_root" merge-base --is-ancestor "$baseline_sha" "$source_head"; then
    source_relation="ahead"
  else
    source_relation="diverged-or-unrelated"
  fi
  if [[ "$source_relation" == "stale" || "$source_relation" == "diverged-or-unrelated" ]]; then
    cat >&2 <<EOF
Refusing to delegate from an outdated or unverifiable main checkout.
Launcher checkout: $origin_root
Launcher branch: $source_branch
Launcher HEAD: $source_head
Baseline ref: $baseline_ref
Baseline SHA: $baseline_sha
Action: fetch origin/main explicitly and launch this script from a checkout whose main includes that baseline. The launcher will not fetch, pull, reset, or switch branches.
EOF
    exit 3
  fi
fi

if [[ -n "$task_file" ]]; then
  if [[ "$task_file" != /* ]]; then
    task_file="$caller_root/$task_file"
  fi
  if [[ ! -f "$task_file" ]]; then
    echo "Task file not found: $task_file" >&2
    exit 2
  fi
  work_order="$(cat "$task_file")"
else
  work_order="$prompt"
fi

if [[ -n "$worktree" ]]; then
  repo_name="$(basename "$(dirname "$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir)")")"
  workspace="$HOME/worktrees/$repo_name/$worktree"
  "$origin_root/scripts/worktree.sh" create "$worktree" --branch "codex/$worktree" --base origin/main --environment development
elif [[ -n "$workspace" ]]; then
  if [[ ! -d "$workspace" ]]; then
    echo "Existing worktree not found: $workspace" >&2
    exit 2
  fi
  workspace="$(cd "$workspace" && pwd -P)"
  "$origin_root/scripts/worktree.sh" reuse "$workspace" --environment development
fi
if [[ -n "$workspace" ]]; then
  origin_common="$(git -C "$origin_root" rev-parse --path-format=absolute --git-common-dir)"
  target_common="$(git -C "$workspace" rev-parse --path-format=absolute --git-common-dir)"
  if [[ "$origin_common" != "$target_common" ]]; then
    echo "Worktree belongs to a different repository: $workspace" >&2
    exit 2
  fi
  repo_root="$(git -C "$workspace" rev-parse --show-toplevel)"
fi
if [[ -n "$workspace" ]]; then
  workspace="$(cd "$workspace" && pwd -P)"
  monitor_workspace="$workspace"
else
  monitor_workspace="$repo_root"
fi
repo_root="$(cd "$repo_root" && pwd -P)"
cd "$repo_root"

if [[ -z "$worktree" && -z "$workspace" && "$allow_dirty" -ne 1 && -n "$(git status --porcelain)" ]]; then
  cat >&2 <<'EOF'
Current checkout has uncommitted changes.
Refusing to run Cursor directly because its edits could mix with existing work.

Use one of:
  --worktree <task-name> (recommended)
  --workspace <path>  Reuse an existing worktree
  --allow-dirty       (only when mixing changes is intentional)
EOF
  exit 3
fi

if [[ -n "$workspace" ]]; then
  work_order="$(printf '%s\n\n%s' 'EXISTING WORKTREE REQUIREMENT: Before editing, inspect git status --short, staged and unstaged diffs, and relevant untracked files. Explain what is already changed, preserve all existing work, and continue in this worktree. Do not reset, checkout, stash, clean, or revert existing changes. If the existing diff is ambiguous or conflicts with the work order, stop and report it to the supervisor.' "$work_order")"
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

The final report's verification block is prioritized by the Supervisor monitor.
Report every acceptance criterion using this exact short format, even when a
check could not be completed:
VERIFICATION RESULTS
Choose exactly one coverage line:
COVERAGE: COMPLETE
COVERAGE: INCOMPLETE
PASS: <criterion> — <observable result>
FAIL: <criterion> — <expected and observed result>
UNCONFIRMED: <criterion> — <why it could not be verified>
END VERIFICATION RESULTS
Mark coverage COMPLETE only when every acceptance criterion has one status.
List each criterion exactly once; never report conflicting statuses for it.
Keep this block concise (preferably under 1200 UTF-8 bytes) and near the start
of the final report. A tool/MCP call by itself is not evidence of success; PASS
requires an observed resulting state or result. Do not infer a clean console
unless it was explicitly checked. Missing, malformed, or unavailable evidence
must be UNCONFIRMED, never inferred as PASS. The monitor reports these explicit
status lines ahead of other report text, while preserving secret masking and
the 4 KiB output limit.

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

worker_head="$(git -C "$monitor_workspace" rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || {
  echo "Cannot determine Worker workspace HEAD: $monitor_workspace" >&2
  exit 2
}
worker_branch="$(git -C "$monitor_workspace" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ -z "$worker_branch" ]]; then
  worker_branch="(detached HEAD)"
fi
echo "[delegate-cursor] launcher: $launcher_path" >&2
echo "[delegate-cursor] origin checkout: $origin_root" >&2
echo "[delegate-cursor] source branch: $source_branch" >&2
echo "[delegate-cursor] source HEAD: $source_head" >&2
echo "[delegate-cursor] baseline: $baseline_ref $baseline_sha (local remote-tracking ref; not fetched by launcher)" >&2
echo "[delegate-cursor] worker workspace: $monitor_workspace" >&2
echo "[delegate-cursor] worker branch: $worker_branch" >&2
echo "[delegate-cursor] worker HEAD: $worker_head" >&2
echo "[delegate-cursor] monitor: $origin_root/scripts/delegate-cursor-monitor.py (loaded from launcher checkout)" >&2
echo "[delegate-cursor] monitor checkout: $monitor_workspace" >&2
echo "[delegate-cursor] repository: $(basename "$repo_root")" >&2
echo "[delegate-cursor] route: $route" >&2
echo "[delegate-cursor] tier: $tier" >&2
echo "[delegate-cursor] model: $model" >&2
cmd=(agent)
if [[ "$trust" -eq 1 ]]; then
  cmd+=(--trust)
fi
cmd+=(--model "$model")
if [[ -n "$workspace" ]]; then
  cmd+=(--workspace "$workspace")
fi
cmd+=(--output-format stream-json -p "$full_prompt")

monitor_args=(
  python3 "$origin_root/scripts/delegate-cursor-monitor.py"
  --checkout "$monitor_workspace"
  --route "$route"
  --tier "$tier"
  --model "$model"
)
if [[ -n "$workspace" ]]; then
  monitor_args+=(--workspace-mode)
fi
# Validate the actual Cursor workspace immediately before starting the
# monitored subprocess. This check reads filesystem metadata only.
"$origin_root/scripts/worktree.sh" validate-env "$monitor_workspace" --environment development
exec "${monitor_args[@]}" -- "${cmd[@]}"
