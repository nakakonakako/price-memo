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

## Execution tools, network access, and approvals

Cursor CLI must reach Cursor's external API. Before each invocation, the
Supervisor inspects the execution tools exposed in the current session and
their current schemas, plus the active sandbox and approval policy. Select the
supported execution interface from that evidence. Do not assume the tool API
name or permission options used by a previous Codex session.

| Observed environment | Delegation decision |
|---|---|
| Network access is already permitted | Invoke the delegation script through the currently available execution tool. Do not request unnecessary elevation. |
| Network is restricted and a supported limited approval path is available | Request approval through that path for the delegation command only. Do not broaden the project-wide sandbox or approval policy. |
| Limited approval is unavailable or denied | Stop before invoking or retrying the command. Report the specific policy restriction and use an approved network-enabled Codex environment or an operator-run delegation there. |
| No exposed execution tool can launch the script | Stop and report the missing execution capability; continue in an environment that exposes a supported command execution tool. |
| A permission option such as `require_escalated` is absent or unsupported | Do not assume it exists or emulate it. Use another currently supported limited approval path if exposed; otherwise stop and report the constraint. |
| The execution tool API has a different name | Use the currently exposed equivalent only if its documented capability and current policy allow the command; otherwise stop and report the limitation. |

Never automatically enable `danger-full-access` for delegation. If a broad
permission mode is already active, it is not evidence that the invocation uses
least privilege. Do not alter that mode; keep the command and work order bounded
and report the environment's broader access as an operational caveat.

Classify failures only from observed evidence. DNS, connection, or egress
denials are network failures; missing or expired credentials are authentication
failures; an explicit Playwright MCP approval error is an MCP approval issue
handled by the manual procedure below; a missing command execution capability
is an execution-tool limitation; and an unavailable or denied limited approval
path is an approval-policy limitation. Do not misclassify one as another, or
treat a tooling/environment issue as model difficulty. Do not change the model
tier for these failures or retry indefinitely. Make at most a bounded repair
when it directly addresses the diagnosed cause; otherwise stop and report the
supported alternative environment.

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

The script also supports an explicit Other Models route selected by the Supervisor:

| Option | Model |
|---|---|
| `--fallback-tier light` | `gemini-3.8-flash-low` |
| `--fallback-tier normal` | `claude-sonnet-5-5-medium` |
| `--model-override gpt-5.6-luna-medium` | Reserve candidate, explicit only |

Examples:

```sh
scripts/delegate-cursor.sh --fallback-tier light --task-file /path/to/work-order.md --worktree fallback-light
scripts/delegate-cursor.sh --fallback-tier normal --task-file /path/to/work-order.md --workspace ~/worktrees/price-memo/existing-task
scripts/delegate-cursor.sh --model-override gpt-5.6-luna-medium --task-file /path/to/work-order.md --worktree luna-reserve
```

`--tier` and `--fallback-tier` cannot be combined. A model override cannot be
combined with either tier. `--fallback-tier` and `--model-override` each accept
one occurrence only; repeating either option is rejected. `--workspace` reuses
a worktree belonging to this checkout, runs its setup, and passes its absolute
path to Cursor. The
compatibility alias `--continue-worktree` has the same behavior and is no longer
limited to an Other Models route. The continuation prompt requires the worker
to inspect status, staged and unstaged diffs, and relevant untracked files
before editing, then preserve and continue existing work in place. The standard
worktree, `stream-json`, Playwright MCP, shared profile, and dev server flows
apply to both routes. Workspace trust is enabled by default; `--no-trust` omits
`--trust` for this invocation and a later `--trust` re-enables it. This does not
clear an existing workspace trust decision or provide file-system isolation.
The delegate does not pass
`--approve-mcps`: that option approves every discovered MCP server and is not
used. MCP server approval is independent of workspace trust, sandbox settings,
and the shell command allowlist.

Relative `--task-file` paths are resolved from the invoking repository root and
read before worktree creation or reuse. Absolute paths keep their specified
meaning. The contents become part of the worker prompt, so pass only reviewed
work-order files.

Do not take over implementation merely because the checkout is dirty. Use a
direct checkout only when it is clean and has no concurrent work; otherwise
use the standard Git worktree flow described in
[worktree-development.md](./worktree-development.md).

If Cursor CLI is unavailable, the delegation script is broken, or another
tooling failure prevents delegation, report the concrete failure and repair
the environment or delegation infrastructure, then resume delegation. Do not
silently replace Cursor implementation with Luna implementation because
delegation is inconvenient.

### Delegation run evidence

Before delegation, the Supervisor runs `git fetch origin main` and inspects the
checkout containing the launcher that will actually run. The launcher resolves
its physical script path and derives `origin_root` from that path, not from the
caller cwd. It reads the local `refs/remotes/origin/main` commit without
fetching or changing refs. That SHA is only the available local baseline; the
Supervisor's successful fetch is what establishes that the baseline was
refreshed for this invocation.

When the source branch is `main`, an exact match or a local main that contains
the baseline commit is allowed. A main behind the baseline, diverged/unrelated,
or whose ancestry cannot be verified stops before Worker worktree preparation
or Cursor startup. Missing/invalid `origin/main`, unreadable HEAD, or an
unresolvable launcher checkout also stops safely. Feature branches and
detached HEADs remain allowed when HEAD is valid, regardless of whether their
SHA differs from the baseline. The launcher itself does not fetch, pull, reset,
or switch branches.

If the normal checkout's main is behind, fetch first and run the launcher from
a dedicated harness worktree based on that main. Never update the normal
checkout to make delegation work. The guard is present only in the launcher
version being run: it cannot protect an invocation that directly starts an
older launcher predating the check, so the Supervisor must inspect the actual
launcher checkout before invoking it.

The shared v1 behavioral contract and price-memo test mapping are documented
in [cursor-monitor-contract.md](./cursor-monitor-contract.md).

The launcher reports its absolute path, `origin_root`, source branch and HEAD,
baseline ref and SHA, Worker workspace path/branch/HEAD, monitor script path,
and the monitor's `--checkout`. Worktree creation/reuse, final
environment-link validation, and monitor code all come from `origin_root`,
including when it is itself a non-main worktree. The harness does not switch to
or force-run latest-main scripts; fresh Worker-worktree base selection remains
the existing `scripts/worktree.sh` policy. Cursor receives `--workspace` for a
selected Worker worktree, while the monitor's `--checkout` is the canonical
absolute path Cursor actually edits. For direct checkout runs those paths both
identify `origin_root`.

The delegate records the selected route/tier/model and UTC start time before
launching Cursor with `agent --trust` by default. With `--no-trust`, the
`--trust` argument is omitted. It runs the origin checkout's
`scripts/delegate-cursor-monitor.py`; raw stdout,
stderr, prompts, tool arguments/results, and file contents are not relayed or
persisted. The monitor displays bounded event types, tool categories and
phases, timing, process/result status, byte counts, and fixed error categories.
It does not display command text, paths emitted by tools, or free-form stderr.
Known stream-json event types are `system`, `assistant`, `tool_call`, and
`result`; malformed JSON is counted without showing its contents, and unknown
event types are displayed only as `other`. Assistant/thinking updates and delta
events are aggregated. Tool categories come from known payload shapes, and
tool failures include bounded nested `error`/`failure`/`failed` markers. A run
is successful only when the process exits 0 and the result event reports
success without `is_error: true`.

Each stdout record is limited to 256 KiB by byte count, excluding its LF or
CRLF terminator. Exactly-at-limit records remain parseable. An oversized
record is discarded through its next newline and counted once; parsing resumes
with the following record. This also counts an oversized record that reaches
EOF without a newline. An unterminated final JSON record within the limit is
parsed. The accumulator remains bounded while stdout is discarded, and the
monitor continues reading stderr, handling signals, and waiting for Worker exit.
Ordinary progress output, including heartbeat, event and tool notices, is
limited to 300 lines. Excess lines are counted in the final summary. Signal and
other important failure notifications, final state, and the verification
report are not suppressed. Heartbeat reports monitor liveness, not guaranteed
Worker progress.

Before starting Cursor, the monitor takes a nonblocking advisory lock for the
canonical path of the actual checkout/workspace passed to Cursor. This also
covers direct use of the main checkout. A concurrent delegation to the same
workspace is rejected before Cursor starts; different worktrees can run in
parallel. The lock is held for the monitor process lifetime and is released by
the operating system on normal exit, handled interruption, or process exit.
Lock files contain no workspace path or task data and live in the same
user-owned mode-0700 state directory as failure metadata, with mode 0600.
Unsafe state directories or lock files fail closed. MCP approval remains an
independent manual action; workspace trust does not approve MCP servers.

The final `result` text is kept in memory only, limited to 64 KiB of input,
sanitized for common credential formats and matching secret-like environment
variable values, then displayed with a 4 KiB total output cap. The worker must
include a concise block delimited by `VERIFICATION RESULTS` and
`END VERIFICATION RESULTS`, with `COVERAGE: COMPLETE` or `INCOMPLETE` and one
`PASS`, `FAIL`, or `UNCONFIRMED` line for every acceptance criterion. Each
status line includes the criterion and observed evidence or reason. Status
lines outside this block are shown only as unscoped report text. A tool/MCP call
alone is not evidence of a successful operation. The monitor extracts these
explicit status lines from the full captured report and prints verification
findings before other report text, showing at least one finding from each
reported status in `FAIL`, `UNCONFIRMED`, `PASS` order before the remaining
findings. Counts make omitted details visible when the 4 KiB cap is reached, so
long introductory sections do not hide verification results. Missing,
malformed, conflicting, or incomplete status data is shown as unconfirmed; a
64 KiB input truncation also makes overall verification coverage unconfirmed.
The process/result event outcome remains separate from verification coverage:
a successful CLI result does not imply that the acceptance criteria passed.

The report remains untrusted free-form content; review the Git diff and tests
independently. Sanitization is best-effort and cannot identify every unknown
secret format. Avoid asking the worker to include credentials or sensitive data
in its report. Treat a run as complete only when the process exits successfully
and the final `result` event reports success.

On failure or interruption, the monitor saves only allowlisted metadata (times,
route/tier/model, process/result state, counts, outcome, and categorized stderr
signals) under `$XDG_STATE_HOME/price-memo/delegate-cursor/`, defaulting to
`~/.local/state/price-memo/delegate-cursor/`. The directory must be owned by
the current user with mode `0700`; records are created with mode `0600`, a
maximum size of 8 KiB, and are limited to 20 files retained for at most 7 days.
The monitor uses no-follow/exclusive file creation and fails closed if the state
path is unsafe. It only prunes its own named regular metadata records. Existing
legacy logs and unrelated files are never read, overwritten, or deleted.
Successful runs do not create a failure record. If metadata cannot be saved,
the terminal reports that fact without exposing the underlying filesystem
error.

Failure investigation uses the displayed outcome, result state, timestamps,
tool phases, and error categories. Categories include worktree setup/creation,
MCP initialization, network/connection, authentication, permissions, and
`resource_exhausted`; the latter alone is not proof of a usage quota limit.
Unknown failures remain `cursor_agent_unclassified`. Since raw streams and
stderr excerpts are deliberately unavailable, some failures cannot be
diagnosed from a run record alone. Reproduce with a bounded task and inspect
the relevant Git changes and local environment directly; do not turn on raw
stream logging or automatically switch models to obtain more detail.

Current triage boundaries:

| Classification | Evidence / handling |
|---|---|
| `success` | Process exits 0 and the final result event reports success |
| `worktree_setup` / `worktree_creation` | Categorized setup or Git worktree signals from stderr, when available |
| `tooling_environment_failure` | Supervisor diagnosis from bounded event/tool metadata and categorized stderr signals |
| `implementation_difficulty` | Explicit worker completion/failure report, if available; do not infer it from a generic CLI error |
| `cursor_usage_exhausted` | Observed explicit CLI usage error on a failed run; Codex takes over |
| `cursor_service_model_failure` | Supervisor diagnosis of a persistent service/model-side failure, such as repeated `resource_exhausted`; this is not itself proof of quota exhaustion |
| `cursor_agent_unclassified` | Any remaining failed or incomplete run; use bounded metadata and do not model-fallback automatically |

These classifications are not safely machine-detectable from the current CLI
result event. A single error never triggers fallback. For a suspected persistent
service/model-side failure, the Supervisor may make one bounded confirmation
run on the normal Cursor Models route; if the same failure recurs in that
independent run, the Supervisor may stop normal-route retries and explicitly
select an Other Models route. Do not retry indefinitely. Repair MCP, network,
worktree, dev server, browser, or other tooling/environment failures first.
Keep quota exhaustion distinct from capacity or other service/model-side
failures; when evidence cannot distinguish them, do not call it quota
exhaustion. A fallback still runs through the Cursor CLI infrastructure and is
not guaranteed to succeed.

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

When the monitor reports `cursor_usage_exhausted`, stop Cursor retries and
announce that the current Codex Supervisor is taking over because the CLI usage
limit was confirmed. Inspect `git status --short`, `git diff --cached`,
`git diff`, and untracked paths before working; preserve all existing staged,
unstaged and untracked changes. Continue in the same worker worktree, without
reset, clean, stash or removal. Do not launch another Codex process or switch
models. Implement, run the normal quality checks, verify affected UI in a real
browser, and perform the final review under the same criteria as a Cursor worker.
For UI checks use the existing project Playwright MCP launcher and devserver
helper if available, with the dedicated verification port, one authenticated
profile user at a time, no credential inspection or OAuth automation, and stop
only servers owned by the session. If browser operation is unavailable, report
UI behavior as UNCONFIRMED with the cause and required setup; never claim PASS.
The monitor recognizes the observed `ActionRequiredError` usage message only on
failure, after ANSI removal. It does not infer quota from `resource_exhausted`,
capacity, network, authentication, MCP, or implementation failures. The
structured quota error format is unverified. Other Models options remain
explicit and are never selected automatically.

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
or applies shared DB migrations. Their canonical source is
`shared-supabase-db/supabase/migrations/`; application DB requirements live in
`db-contracts/price-memo.json`. A price-memo task may not modify another repo.
If a schema change is needed, escalate to Sol and Luna; implementation belongs
in a separate, explicitly supervised shared-supabase-db task.

## Worktree policy

The standard checkout is `~/web/price-memo`; additional worktrees are stored at
`~/worktrees/price-memo/<task-name>`. Environment files live outside Git under
`~/.config/price-memo/<environment>/`. Follow [worktree-development.md](./worktree-development.md)
for create, list, reuse, setup, removal, and Cursor delegation commands.

Use a direct checkout only when one worker is running, the checkout is clean,
and no concurrent implementation touches the repository. Use the standard Git
worktree flow for concurrent work, an uncommitted checkout, or changes that
need isolation. Existing worktrees in other locations are not moved or removed
automatically.

## Cursor worker UI verification

### Roles

- **Cursor worker**: normally executes live UI verification and reports evidence.
- **Codex / Luna supervisor**: after confirmed Cursor usage exhaustion, uses
  the same project browser path and restrictions; unavailable checks are
  UNCONFIRMED. Otherwise, delegate browser verification to Cursor.

- **Human developers**: use `npm run dev` at `http://localhost:5173` for local
  development and manual browser debugging. This is not the Codex supervisor UI
  verification path and not a supervisor fallback when MCP is unavailable.
  `npm run dev:playwright` remains available for ordinary manual use only.

### Official verification path

Use this path end to end; do not substitute standalone Playwright CLI,
`npx playwright`, system Chrome, or other browser tools:

1. `npm run devserver:ensure`
2. Playwright MCP selected by purpose (`playwright` for authenticated
   UI, `playwright-unauth` for login/pre-auth UI)
3. The matching launcher from `.cursor/mcp.json`
   (`.cursor/playwright-mcp.sh` or `.cursor/playwright-unauth-mcp.sh`)
4. managed Chromium (pinned revision/cache in the launcher)
5. The matching browser state: shared persistent profile at
   `${userHome}/.local/state/price-memo/playwright-profile` for `playwright`, or
   an in-memory `--isolated` profile for `playwright-unauth`
6. `http://localhost:5273`
7. `npm run devserver:stop` for process groups started by that ensure invocation

Always navigate the browser to `http://localhost:5273`; the helper prints this
browser URL after startup. Internal service health checks may use
`127.0.0.1`, which must not be used as the browser URL because its origin has
separate authentication storage.

The helper (`scripts/cursor-devserver.sh`) starts or reuses the price-memo
backend on `:8001` and frontend on `:5273` (Vite `strictPort`). If a port is
occupied by an unrelated process, the helper refuses to start and does not kill
or fall back to another port. It records only process groups started by that
ensure invocation in per-worktree state under
`${userHome}/.local/state/price-memo/cursor-devserver/`, so a fresh session
cannot stop reused servers. Workers start 5273 as needed; it does not need to be
prestarted for them.

### MCP and authentication policy

- If Playwright MCP tools are unavailable, repair the MCP environment and retry
  the official path. Do not fall back to another browser route from the
  supervisor or worker.
- Never automate Google OAuth. Never read, inspect, print, copy into the
  repository, or include profile files, cookies, tokens, `localStorage`, or
  `sessionStorage` in prompts or logs.
- Select the configured project MCP by verification purpose: `playwright` for
  authenticated UI using the shared persistent profile, and `playwright-unauth`
  for login/pre-auth UI using `--isolated` with no user-data directory or saved
  storage state. Logout unit tests use mocks. Real logout behavior checks use a
  dedicated profile and a separate Dev test account, never the shared profile.
- In the authenticated shared `playwright` MCP, do not log out, clear site data
  or browser storage, or otherwise invalidate/change its authentication state.
  The MCP does not technically prevent destructive actions; these rules and
  operator review are the protection.
- The app login screen alone does not prove Google credentials or Google-side
  login state have expired. If an authenticated UI cannot be confirmed, report
  `アプリ側は未認証、Google側のログイン状態は未確認` and stop. If Google
  interactive sign-in appears, stop for manual operator review; workers never
  click login buttons or automate OAuth. Operator observations do not authorize
  worker OAuth or guarantee future sessions.
- Run UI checks sequentially. The authenticated persistent profile may be used
  by only one browser instance at a time; the isolated unauthenticated MCP has
  separate in-memory browser state.

If a delegation reports that an MCP approval is missing, stop the run. Review
the named project MCP in `.cursor/mcp.json`, then manually run
`agent mcp enable <server-name>` from the price-memo repository and retry the
delegation. This approves only that server in Cursor's local approved-server
list; the delegate never enables MCPs, and no global MCP configuration is
changed. Do not approve other servers to resolve this error.

Both MCP launchers pin `@playwright/mcp` 0.0.83, its exact `playwright` /
`playwright-core` dependency 1.64.0-alpha-1790635538000, and Chromium revision
1247. `.cursor/playwright-mcp.sh` uses the shared persistent profile;
`.cursor/playwright-unauth-mcp.sh` uses `--isolated` and does not pass a
user-data directory, storage-state file, or external browser connection. The
unauthenticated launcher clears inherited MCP environment variables that could
attach saved or external browser state. Both set
`PLAYWRIGHT_BROWSERS_PATH` to the shared `${userHome}/.cache/ms-playwright`
cache and install the pinned Chromium only when its expected headless-shell
binary is absent. The isolated profile keeps state in memory and is discarded
when the browser session closes. These settings separate browser storage but
do not technically prevent destructive actions through the authenticated MCP
or isolate operating-system access. Update the MCP version, Playwright version,
and browser revision together after checking the package metadata and
`playwright-core/browsers.json`; do not use `@latest` or system Chrome.

## Retry / escalation

- Environment/tooling failure: diagnose it from the currently exposed execution capability and active policy, then use only the supported network/approval path described above. Do not intentionally make a command attempt that current policy blocks. Make a bounded repair only when it addresses the observed failure; otherwise stop and report the alternative environment. Do not escalate the model just because setup failed.
- Cursor CLI or delegation-script failure: report the failure, repair the environment or delegation infrastructure, then resume delegation; do not switch to Luna implementation as a shortcut.
- `light` struggles with implementation: clarify the work order and retry as `normal`.
- `normal` struggles after a clarified work order: retry as `hard`.
- `hard` still cannot complete due to implementation difficulty: escalate to the Sol supervisor before another implementation attempt.
- Cursor usage exhaustion: stop Cursor retries and follow the Codex handoff above.
- High-risk areas listed above should receive Codex review even if Cursor succeeds.
