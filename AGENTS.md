# price-memo

## Project source of truth

Before making non-trivial changes, read `docs/project-overview.md`.

Also inspect the relevant `docs/spec-*.md` before changing documented behavior.

When features, environment, architecture, dependencies, or data models change,
update `docs/project-overview.md` and the relevant specification.

## Product boundary

This repository is Feature B: strict unit-price comparison.

Responsibilities include:
- manually selected product folders
- confirmed weight / quantity / volume data
- strict unit-price calculation
- price trends
- store comparison
- shopping memo functionality

Do NOT turn this repository into a household expense manager.

Do not introduce:
- AI automatic expense categories
- general household expense tracking
- approximate package weights as confirmed data

`price-memo` may optionally reference receipt data from `receipt-manager`,
but it must remain functional without `receipt-manager`.

The dependency direction is B -> A only.
Do not introduce A -> B dependencies.

## Stack

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase client

Backend:
- Python
- FastAPI
- Supabase
- uv

## Verification

After implementation, run the standard quality check from the repository root as a rule:

    npm run check

If a quality check fails, fix the cause in the code rather than disabling the check or rule.
Run individual checks additionally when needed to investigate a failure.

## Database safety

Shared Supabase DB migrations are managed only in `receipt-manager/supabase/migrations/`.
When a schema change is needed, add the migration in `receipt-manager`; do not keep
migrations or run `db push` from this repository.

## Implementation rules

- Never introduce TypeScript `any`.
- Preserve exact unit semantics and avoid guessed values.
- Follow existing architecture before adding abstractions.
- Prefer small focused changes.
- When changing shared A/B behavior, inspect the integration specification first.

## UI verification

When frontend UI changes can affect layout, responsive behavior, styling, or
user interaction, verify the rendered application through the single official
path below. Simple non-visual changes do not require browser verification unless
there is a specific reason. After fixing a visual or interaction bug, verify the
affected screen before considering the task complete.

### Roles

- **Cursor worker**: the only official actor for live UI verification in this
  repository. Workers run the path below and report what they observed.
- **Codex / Luna supervisor**: does not operate a browser. Reviews the worker
  diff and completion report. A supervisor session without browser tools is not
  a verification failure. Delegate additional UI checks to a verification-only
  Cursor worker instead of attempting browser work from the supervisor.
- **Human developers**: use `npm run dev` at `http://localhost:5173` for local
  development and manual browser debugging. This is not the Codex supervisor UI
  verification path and not a supervisor fallback when MCP is unavailable.

### Official verification path (Cursor worker only)

Use this path end to end; do not substitute standalone Playwright CLI,
`npx playwright`, system Chrome, or other browser tools:

1. `npm run devserver:ensure`
2. Cursor Playwright MCP
3. `.cursor/playwright-mcp.sh` (stdio server from `.cursor/mcp.json`)
4. managed Chromium (pinned revision/cache in the wrapper script)
5. shared persistent profile at
   `~/.local/state/price-memo/playwright-profile`
6. `http://localhost:5273`
7. `npm run devserver:stop` for process groups started by that ensure invocation

The helper starts or reuses the price-memo backend on `:8001` and frontend on
`:5273` (`strictPort`), refuses unrelated port occupants without fallback or
kill, and records per-worktree state under the user's home directory so a fresh
session cannot stop reused servers. Run MCP browser checks sequentially; only
one MCP browser may use the profile at a time.

### MCP and authentication policy

- If Playwright MCP tools are unavailable, repair the MCP environment and retry
  the official path. Do not fall back to another browser route.
- Never automate Google OAuth. Never read, inspect, print, copy into the
  repository, or include profile files, cookies, tokens, `localStorage`, or
  `sessionStorage` in prompts or logs.
- When the official path shows a Google login screen, treat the profile
  authentication session as expired, report that fact, and stop for manual
  re-login in the Playwright MCP browser. Do not continue UI verification until
  authentication is restored manually.

## Codex supervisor escalation (Luna → Sol)

Classify the task before broad repository investigation. For an escalation
trigger below, do only the minimum initial check needed to confirm context, then
spawn exactly one project custom agent named `sol_supervisor` before design
decisions or implementation. Pass a concise handoff with only:
`task`, `escalation reason`, `known facts`, and `required decision`.

Escalate early for:
- database schema or migration needs
- authentication, authorization, or security boundaries
- public API contract changes
- CI/CD or deployment
- Docker, nginx, or production infrastructure
- cross-repository changes
- undocumented architecture decisions
- complex bugs spanning multiple areas when the cause is unclear
- a Cursor `hard` attempt that failed from implementation difficulty and needs
  redesign

For shared Supabase schema changes, price-memo must never create, keep, or apply
migrations. The migration source of truth is
`receipt-manager/supabase/migrations/`. Escalate the design to Sol and Luna;
if implementation is required, treat it as a separately supervised
cross-repository task in receipt-manager. A Cursor worker delegated from
price-memo must not independently edit receipt-manager or any other repository.

Do not escalate routine UI/CSS, understood local bugs, normal feature work,
lint/test work, or small refactors to Sol. Luna owns classification, scope,
implementation routing, and review for those tasks. Cursor is the default
implementation worker, subject to the ownership rules below.

Sol is a read-only design and investigation adviser. It returns evidence,
recommendation, tradeoffs, and a bounded implementation plan to Luna. Sol must
not edit files, invoke Cursor, or spawn subagents. Luna owns the final decision
and any Cursor delegation. Do not spawn another Sol for the same decision;
re-escalate only if the scope changes materially and creates a new independent
high-risk decision.

## Cursor worker delegation (Codex supervisor only)

At task start, Luna chooses the implementation owner and briefly gives the
reason. Cursor is the default worker for UI/UX improvements, ordinary feature
work, localized bug fixes, routine test/lint fixes, and implementation tasks
with independently verifiable completion criteria. Use
`scripts/delegate-cursor.sh` for that bounded work.

Luna may implement directly when a high-risk or multi-area task needs repeated
short implementation/verification cycles (for example, complex database
migrations, authentication, RLS, or security boundaries), or when Cursor
delegation is clearly less efficient. State the concrete reason. Required Sol
review for high-risk design remains in force before implementation; direct
implementation does not replace it. Do not choose direct implementation solely
because the checkout is dirty or delegation needs setup.

For either implementation path, keep the same acceptance criteria and quality
checks. Do not skip required tests, `npm run check`, security review, or final
diff review because Cursor was unavailable or failed. When delegating, state the
owned files/scope and concrete completion criteria.

Keep existing Git/worktree protections regardless of implementer: inspect and
preserve staged, unstaged, and untracked work, and isolate concurrent or risky
changes in a task-specific worktree. Luna's direct implementation is not
permission to mix changes in a dirty shared checkout.

Sol escalation and implementation routing are separate decisions: **not
escalating to Sol does not automatically select Luna as implementer**. Use
Cursor by default for the bounded task types above; select Luna only under the
direct-implementation conditions above.

Luna's supervisor work includes requirement clarification, investigation,
task classification, Sol escalation, implementation-owner selection, design,
progress management, and final review. Luna may also implement when the direct
implementation conditions above apply. Setup overhead or a dirty checkout
alone is not sufficient reason; explain the efficiency or iteration need.

Select the Cursor tier through the script, using `light` by default:

- `light` → `composer-2.5`
- `normal` → `grok-4.7-medium`
- `hard` → `grok-4.7-high`

When using Cursor, use a direct checkout only when it is clean and there is no
concurrent work. If it is dirty, shared with concurrent edits, or needs
isolation, use `--worktree <name>`. A dirty checkout alone does not select Luna
as implementer; apply the direct-implementation criteria above.

Cursor CLI connects to Cursor's external API. Every Codex Supervisor invocation
of `scripts/delegate-cursor.sh` must use network-enabled execution from the
first attempt (`functions.exec_command` with `sandbox_permissions:
"require_escalated"`). Do not run it once in the restricted sandbox and retry
after `getaddrinfo EAI_AGAIN`; that failure is expected when the command lacks
network access. Keep this permission scoped to the delegation command. Do not
enable network access for the whole project sandbox solely to support Cursor.

If Cursor CLI is unavailable, the delegate script fails, or another tooling
failure prevents delegation, stop unproductive waits/retries and report the
specific failure. Choose a bounded environment repair and retry only when that
is the efficient path; otherwise Luna may take over when the direct-
implementation conditions above are met. A tooling failure alone does not
justify skipping Sol review, required verification, or final review. Tooling
failures do not justify a model-tier escalation.

These instructions describe the supervisor's delegation process; they do not
authorize Cursor, when acting as the implementation worker, to invoke the
delegation script or re-delegate. Cursor must follow the repository rules above
and `.cursor/rules/worker.mdc`.

The project-level Cursor CLI shell allowlist explicitly permits common
read-only inspection tools (`pwd`, `rg`, `grep`, `head`, `tail`, `wc`, `sort`,
`uniq`, `cut`, and `ss`) alongside the existing `npm`, `uv`, `git`, `ls`, `cat`,
and `cp` entries. Keep `sudo`, `rm`, and broad `bash`/`sh` permissions denied;
do not add `Shell(*)`. Prefer one simple command per shell call or an existing
`npm` script instead of compound shell expressions. This keeps non-interactive
worker execution predictable while allowing routine repository and local-port
inspection.

Model tiers are fixed: `light` uses `composer-2.5`, `normal` uses
`grok-4.7-medium`, and `hard` uses `grok-4.7-high`. Start bounded routine work
with `light`. If Composer has implementation difficulty, clarify the work order
and retry with `normal`, then use `hard` only if medium still cannot complete
for implementation reasons. Tooling or environment failures do not justify a
model escalation. Do not use `fast`, `xhigh`, or other model families by default.

Composer and Grok are both in Cursor Models. Switching between them does not
provide a quota fallback. The CLI does not expose a verified quota-specific
error signal, so never grep guessed quota strings or automatically switch model
pools. Only the Supervisor may select an explicit Other Models route after
reviewing evidence of either a Cursor Models usage/quota limit or a persistent
Cursor service/model-side failure (for example, repeated `resource_exhausted`
errors). A single error is not enough: confirm the same failure in a second
independent, bounded normal-route run, and do not retry indefinitely. Repair
MCP, network, worktree, dev server, browser, or other tooling/environment
failures first; those do not justify fallback. Keep quota exhaustion distinct
from service capacity or other model-side failures, and do not label an
ambiguous failure as quota exhaustion. Other Models runs use the same Cursor
CLI infrastructure, so fallback is not guaranteed to succeed. They may incur
on-demand charges; the Supervisor and delegate must not enable or change
billing settings.

Explicit routes are `--fallback-tier light` → `gemini-3.8-flash-low` and
`--fallback-tier normal` → `claude-sonnet-5-5-medium`. The reserve
`--model-override gpt-5.6-luna-medium` is available only by explicit
Supervisor choice. These options cannot be combined with `--tier`. To resume a
partial task, use `--continue-worktree <path>` with an explicit Other Models
route. The worker must inspect staged/unstaged diffs and relevant untracked
files before editing and preserve all existing work. Regular tier retries
remain Composer → Grok medium → Grok high for implementation difficulty only.

For the escalation areas above, Sol advises early and Luna makes the
final design decision before implementation. After that decision, Luna chooses
Cursor or direct implementation under the ownership rules above; preserve the
required review and verification either way.

When using Cursor, use a direct checkout for one worker only when the checkout
is clean and there is no concurrent work. Use `--worktree` for parallel
workers, a dirty checkout, concurrent edits, or a large/risky change that
needs isolation. A dirty checkout is not by itself a reason for Luna to take
over; apply the direct-implementation criteria above.

If Cursor encounters a tooling/environment failure, report it and repair the
environment rather than escalating the model. Do not repeat unproductive waits
or retries; decide whether one bounded repair/retry is worthwhile or Luna
should take over under the direct-implementation conditions above. Retry
implementation difficulty at the next tier after clarifying the work order. If
a `hard` attempt still fails and redesign is needed, use the Sol escalation
above before another implementation attempt. These choices do not change the
required Sol review or quality checks.
Review high-risk work in Codex even after a successful worker run.
