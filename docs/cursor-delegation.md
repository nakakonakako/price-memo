# Codex → Cursor delegation policy

## Roles

- **Codex CLI / Luna**: supervisor and router. Requirement clarification, initial investigation and classification, Sol escalation decisions, implementation approach and work-order decisions, delegation, and review.
- **Cursor CLI**: bounded implementation worker. Code edits, tests, browser verification, and completion report for assigned work orders.

## Default implementation routing

When Luna is acting as the Codex supervisor, bounded code implementation,
UI fixes, bug fixes, test/lint fixes, and small refactors go to Cursor by
default through `scripts/delegate-cursor.sh`. This routing applies whether or
not Sol escalation is needed. A decision to keep routine UI/CSS or a known
local bug off the Sol path means Luna retains supervisor ownership; it does not
mean Luna should implement the change herself.

Cursor CLI must reach Cursor's external API. The Codex Supervisor must run each
`scripts/delegate-cursor.sh` invocation with network-enabled execution from the
start (`functions.exec_command` using `sandbox_permissions: "require_escalated"`).
Do not first run it in the restricted sandbox and then retry after
`getaddrinfo EAI_AGAIN`; the restricted attempt is expected to fail before the
Cursor API can be reached. Keep network access scoped to this delegation
command. Do not enable network access for the project sandbox globally solely
for Cursor delegation.

Luna primarily clarifies requirements, investigates enough to classify and
bound the task, decides whether Sol advice is needed, chooses the implementation
approach, writes the Cursor work order, and reviews the result and diff. Luna
may directly work on delegation infrastructure itself. A user may also
explicitly assign implementation to Luna, which overrides the default route.

Use `light` by default. Select tiers via the delegation script:

| Tier | Model |
|---|---|
| `light` | `composer-2.5` |
| `normal` | `grok-4.7-medium` |
| `hard` | `grok-4.7-high` |

The script also supports an explicit Other Models route, selected only by the
Supervisor after diagnosing a likely Cursor Models usage/quota failure:

| Option | Model |
|---|---|
| `--fallback-tier light` | `gemini-3.8-flash-low` |
| `--fallback-tier normal` | `claude-sonnet-5-5-medium` |
| `--model-override gpt-5.6-luna-medium` | Reserve candidate, explicit only |

Examples:

```sh
scripts/delegate-cursor.sh --fallback-tier light --task-file /tmp/work-order.md --worktree fallback-light
scripts/delegate-cursor.sh --fallback-tier normal --task-file /tmp/work-order.md --continue-worktree /path/to/existing/worktree
scripts/delegate-cursor.sh --model-override gpt-5.6-luna-medium --task-file /tmp/work-order.md --worktree luna-reserve
```

`--tier` and `--fallback-tier` cannot be combined. A model override cannot be
combined with either tier. `--continue-worktree` is only available with an
explicit Other Models route and requires a worktree belonging to this checkout.
The continuation prompt requires the worker to inspect status, staged and
unstaged diffs, and relevant untracked files before editing, then preserve and
continue existing work in place. The standard `--trust`, `--approve-mcps`,
worktree, `stream-json`, Playwright MCP, shared profile, and dev server flows
apply to both routes.

Do not take over implementation merely because the checkout is dirty. Use a
direct checkout only when it is clean and has no concurrent work; otherwise
delegate with `--worktree <name>` so the implementation is isolated.

If Cursor CLI is unavailable, the delegation script is broken, or another
tooling failure prevents delegation, report the concrete failure and repair
the environment or delegation infrastructure, then resume delegation. Do not
silently replace Cursor implementation with Luna implementation because
delegation is inconvenient.

### Delegation run evidence

`scripts/delegate-cursor.sh` records the selected tier/model, worktree, and UTC
start time before launching Cursor with `agent --trust --approve-mcps`. It runs
print mode with `stream-json`,
relays stdout and stderr to the Codex terminal, and saves each stream under a
temporary log directory printed at launch. On completion, it reports the
process exit code and the final `result` event status (`success`, `error`, or
`missing`), along with the finish time and outcome. After successful completion,
the temporary log directory is removed. On failure or incomplete results, logs
are retained and their location is reported. Treat a run as complete only when
the process exits successfully and the final result event reports success.

When a run fails, the script classifies recognizable worktree creation and
setup failures separately from Cursor agent failures. Review the printed logs
and actual process/result status before concluding that delegation failed;
the diagnostic classification is based on Cursor CLI output and may be
`cursor_agent_unclassified` when the CLI does not emit a recognizable phase marker.

Current triage boundaries:

| Classification | Evidence / handling |
|---|---|
| `success` | Process exits 0 and the final result event reports success |
| `worktree_setup` / `worktree_creation` | Recognized setup or Git worktree diagnostics in the retained run logs |
| `tooling_environment_failure` | Supervisor diagnosis from the retained logs; the final result event has no stable subtype for this |
| `implementation_difficulty` | Explicit worker completion/failure report, if available; do not infer it from a generic CLI error |
| `cursor_models_usage_quota_limit` | Only when Cursor provides a structured quota-specific reason; not currently verified |
| `cursor_agent_unclassified` | Any remaining failed or incomplete run; preserve logs and do not model-fallback automatically |

The last three classifications are not safely machine-detectable from the
current CLI result event. That ambiguity is intentional: a generic agent error
must not trigger a paid Other Models request.

## Shell permissions and Auto-review

`.cursor/cli.json` keeps an explicit allowlist for routine worker commands. It
includes read-only `pwd`, `rg`, `grep`, `head`, `tail`, `wc`, `sort`, `uniq`,
`cut`, and `ss`, plus the existing `npm`, `uv`, `git`, `ls`, `cat`, and `cp`.
`find` is omitted because `rg --files` covers repository file discovery;
`dirname`, `basename`, and `stat` have no demonstrated direct worker need;
`ps` can expose broader process details and is unnecessary for normal checks.
The dev-server lifecycle is provided through the existing `npm run
devserver:*` scripts, which do their own process ownership checks.

Do not allow `sudo`, `rm`, `bash`, `sh`, or `Shell(*)`. When a compound shell
expression is denied, split it into simple commands or use an existing npm
script; do not broaden the allowlist to make arbitrary shell composition work.

The current CLI's `--auto-review` mode uses a server classifier to auto-run
calls judged safe and prompts for the rest. That can reduce approval friction,
but leaves execution dependent on classification and prompts, which is less
reproducible for this non-interactive worker workflow. Keep using the fixed
read-only allowlist as the default; do not add `--auto-review` to the launcher
unless the workflow is deliberately redesigned and tested for prompt handling.

## Cursor model tiers

| Tier | Model | Typical work |
|---|---|---|
| `light` | `composer-2.5` | **Default.** Bounded routine implementation, UI/CSS, small-to-medium local changes, clear bug fixes, lint/tests/docs, ordinary Playwright verification |
| `normal` | `grok-4.7-medium` | Retry after Composer implementation difficulty and a clarified work order |
| `hard` | `grok-4.7-high` | Retry after medium implementation difficulty; redesign after a hard failure goes to Sol |

Start at `light`. Escalate only for implementation difficulty: clarify the work
order, then retry `normal`, and use `hard` only if medium still cannot complete.
Tooling, environment, network, MCP, or worktree failures must be repaired or
reported without changing models. Do not use xhigh/fast models by default.

## Cursor Models quota and Other Models fallback

The CLI's current `agent models` output confirms Other Models IDs for this
account, including `gemini-3.8-flash-low`, `gemini-3.8-flash-medium`,
`claude-sonnet-5-5-medium`, and `gpt-5.6-luna-medium`. Cursor's published rates
are token-based, not per task: Gemini 3.8 Flash is $0.75/M input and $3.50/M
output; Claude Sonnet 5.5 is $2/M input and $10/M output; GPT-5.6 Luna is
$0.20/M input and $1.20/M output. These models draw from the separate Other
Models pool. If that pool is exhausted and on-demand usage is enabled, requests
may be billed at those rates.

The benchmark favored `gemini-3.8-flash-low` for light bounded work and
`claude-sonnet-5-5-medium` for normal implementation. GPT-5.6 Luna remains a
low-cost reserve candidate, but it did not complete the benchmark's Playwright
acceptance criteria, so it is not the default fallback. These routes are now
available only through the explicit options above; the delegate never switches
to Other Models automatically.

The current CLI help documents `--model`, while `--output-format stream-json`
provides a final result event with success/error status. Neither `agent models`
nor this result event exposes a verified quota-specific error code or remaining
pool balance. The script does not grep guessed quota text or retry a failed
worker on another model. The Supervisor reviews the retained logs and selects
an explicit fallback only when the evidence supports a usage/quota diagnosis;
MCP, network, worktree, dev server, and browser failures remain environment
issues to repair first. All failed runs are returned as ordinary failures with
their logs retained. Billing and on-demand settings are never changed by the
script; the chosen Other Models route may still be subject to the account's
existing billing configuration.

## Supervisor-only / supervisor-first areas

For these areas, escalate early to Sol for design advice; Luna makes the final
decision before implementation:

- database schema or migrations
- authentication / authorization / security boundaries
- public API contract changes
- CI/CD, Docker, nginx, deployment, or production infrastructure
- cross-repository changes
- product-boundary or undocumented architecture decisions

After Luna's decision, bounded implementation pieces are delegated to Cursor
under the default routing rule above, unless the user explicitly assigns the
implementation to Luna or the work is delegation-infrastructure maintenance.

## Luna → Sol escalation

Classify the request before broad investigation. Escalate early by spawning
exactly one `sol_supervisor` for database schema/migrations, auth or security
boundaries, public API contracts, CI/CD/deployment, Docker/nginx/production
infrastructure, cross-repository work, undocumented architecture, unclear
complex cross-area bugs, or a Cursor `hard` failure that needs redesign.
Pass only `task`, `escalation reason`, `known facts`, and `required decision`.

Sol is a read-only adviser: it investigates and returns evidence, a decision
recommendation, tradeoffs, and a bounded implementation plan. Sol does not edit
files, run Cursor, or spawn another agent. Luna makes the final decision and
owns Cursor delegation. Routine UI/CSS, understood local bugs, normal features,
lint/tests, and small refactors stay on the Luna → Cursor path: Luna supervises
and Cursor implements.

### price-memo boundary

This repo remains a strict unit-price comparison and shopping memo app. Preserve
exact weight/quantity/volume semantics; never treat guessed values as confirmed.
Do not bring in household expense management. price-memo never creates, stores,
or applies shared DB migrations. They are maintained only in
`receipt-manager/supabase/migrations/`. A price-memo Cursor task may not modify
receipt-manager or another repo. If a schema change is needed, escalate to Sol
and Luna; any implementation must be a separate, explicitly supervised
cross-repo task in receipt-manager.

## Worktree policy

Do **not** use a worktree for every task.

Use direct checkout when:
- one Cursor worker is running
- the checkout is clean
- no concurrent implementation is touching the same repo

Use `--worktree` when:
- multiple Cursor workers run in parallel
- Codex or the user is concurrently editing the repo
- the current checkout has uncommitted work that should be isolated
- a risky/large implementation should be kept separate until reviewed

## Cursor worker UI verification

For local UI checks, Cursor workers should run `npm run devserver:ensure`
before Playwright MCP checks at `http://localhost:5273`, then
`npm run devserver:stop` when finished. The helper (`scripts/cursor-devserver.sh`)
starts or reuses the price-memo backend on `:8001` and frontend on `:5273`
(Vite `strictPort`). If a port is occupied by an unrelated process, the helper
refuses to start and does not kill or fall back to another port. It records only
process groups started by that ensure invocation in per-worktree state under
`${userHome}/.local/state/price-memo/cursor-devserver/`, so a fresh session cannot
stop reused servers. Workers start 5273 as needed; it does not need to be
prestarted for them. Human development and browser debugging continue to use
`npm run dev` at `http://localhost:5173`. Ordinary `npm run dev:playwright`
remains available unchanged for manual use.

The Playwright MCP uses the shared persistent profile at
`${userHome}/.local/state/price-memo/playwright-profile`. This path is outside
the repository and resolves to the same user directory from the main checkout
and Cursor worktrees. The first Google OAuth login is manual in the Playwright
MCP browser; do not automate Google login or put credentials in Cursor prompts.
Treat profile files as authentication secrets: never inspect, print, copy into
the repository, or include their contents, cookies, or tokens in prompts or
logs. Only one MCP browser may use the profile at a time; perform UI checks
sequentially and close the browser before another worker starts one.

The MCP launcher pins `@playwright/mcp` 0.0.83, its exact `playwright` /
`playwright-core` dependency 1.64.0-alpha-1790635538000, and Chromium revision
1247 in `.cursor/playwright-mcp.sh`. It sets
`PLAYWRIGHT_BROWSERS_PATH` to the shared `${userHome}/.cache/ms-playwright`
cache and installs the pinned Chromium only when its expected headless-shell
binary is absent. Update the MCP version, Playwright version, and browser
revision together after checking the package metadata and
`playwright-core/browsers.json`; do not use `@latest` or system Chrome.

## Retry / escalation

- Environment/tooling failure: report and repair the environment; do not escalate model just because setup failed. For Cursor delegation, make the first attempt network-enabled as described above; do not intentionally make a restricted attempt first.
- Cursor CLI or delegation-script failure: report the failure, repair the environment or delegation infrastructure, then resume delegation; do not switch to Luna implementation as a shortcut.
- `light` struggles with implementation: clarify the work order and retry as `normal`.
- `normal` struggles after a clarified work order: retry as `hard`.
- `hard` still cannot complete due to implementation difficulty: escalate to the Sol supervisor before another implementation attempt.
- Cursor Models usage/quota limit: do not try another Cursor Models tier (same pool) or silently switch to Other Models. The Supervisor may explicitly choose `--fallback-tier light|normal` after reviewing the failure; no quota string matching is used. For partial work, use `--continue-worktree` so the worker reviews and preserves the existing diff. Tooling/environment failures are repaired without fallback. Other Models failures are returned normally; billing settings are never changed.
- High-risk areas listed above should receive Codex review even if Cursor succeeds.
