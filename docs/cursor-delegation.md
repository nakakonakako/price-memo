# Codex → Cursor delegation policy

## Roles

- **Codex CLI**: supervisor. Requirements, task decomposition, architecture decisions, escalation handling, and selective review.
- **Cursor CLI**: implementation worker. Investigation, code edits, tests, browser verification, and completion report.

## Cursor model tiers

| Tier | Model | Typical work |
|---|---|---|
| `light` | `composer-2.5` | CSS tweaks, lint fixes, docs, simple tests, small local edits |
| `normal` | `grok-4.7-medium` | Default. Normal feature work, multi-file fixes, ordinary bug investigation |
| `hard` | `grok-4.7-high` | Complex bugs, larger refactors, broad implementation work |

Use `normal` by default. Do not use xhigh/fast models by default.

## Supervisor-only / supervisor-first areas

For these areas, escalate early to Sol for design advice; Luna makes the final
decision before implementation:

- database schema or migrations
- authentication / authorization / security boundaries
- public API contract changes
- CI/CD, Docker, nginx, deployment, or production infrastructure
- cross-repository changes
- product-boundary or undocumented architecture decisions

After Luna's decision, bounded implementation pieces may still be delegated to
Cursor.

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
lint/tests, and small refactors stay on the Luna → Cursor path.

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

## Retry / escalation

- Environment/tooling failure: fix the environment; do not escalate model just because setup failed.
- `light` struggles with implementation: retry as `normal`.
- `normal` struggles after a clarified work order: retry as `hard`.
- `hard` still cannot complete due to implementation difficulty: escalate to the Sol supervisor before another implementation attempt.
- High-risk areas listed above should receive Codex review even if Cursor succeeds.
