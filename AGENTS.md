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