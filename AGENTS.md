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

When changing frontend UI:

- Verify the rendered application when the change can affect layout,
  responsive behavior, styling, or user interaction.
- Choose the most appropriate browser tool for the task.
- Do not use both Computer Use and Playwright unnecessarily.
- Prefer Playwright when DOM structure, element dimensions,
  overflow, responsive behavior, or deterministic interaction needs inspection.
- Prefer Computer Use when visual appearance or behavior is best judged
  from the rendered screen.
- Use both only when one tool alone is insufficient.
- For simple non-visual changes, browser verification is not required
  unless there is a specific reason.
- After fixing a visual or interaction bug, verify the affected screen
  before considering the task complete.

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
lint/test work, or small refactors. Keep those with the Luna supervisor and
continue through the Cursor rules below.

Sol is a read-only design and investigation adviser. It returns evidence,
recommendation, tradeoffs, and a bounded implementation plan to Luna. Sol must
not edit files, invoke Cursor, or spawn subagents. Luna owns the final decision
and any Cursor delegation. Do not spawn another Sol for the same decision;
re-escalate only if the scope changes materially and creates a new independent
high-risk decision.

## Cursor worker delegation (Codex supervisor only)

When Codex CLI is acting as the supervisor, delegate bounded implementation
work to Cursor CLI with `scripts/delegate-cursor.sh`. These instructions describe
the supervisor's delegation process; they do not authorize Cursor, when acting
as the implementation worker, to invoke the delegation script or re-delegate.
Cursor must follow the repository rules above and the worker instructions in
`.cursor/rules/worker.mdc`

Model tiers are fixed: `light` uses `composer-2.5`, `normal` uses
`grok-4.7-medium`, and `hard` uses `grok-4.7-high`. Use `normal` by default.
Do not use `fast`, `xhigh`, or other model families by default.

For the escalation areas above, Sol advises early and Luna makes the
final design decision before implementation. Delegate only bounded implementation
pieces after that decision.

Use direct checkout for one worker when the checkout is clean and there are no
concurrent edits. Use `--worktree` for parallel workers, a dirty checkout,
concurrent edits, or a large/risky change that needs isolation.

If Cursor encounters a tooling/environment failure, fix the environment rather
than escalating the model. Retry implementation difficulty at the next tier
after clarifying the work order. If a `hard` attempt still fails and redesign
is needed, use the Sol escalation above before another implementation attempt.
Review high-risk work in Codex even after a successful worker run.
