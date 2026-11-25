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

The shared Supabase DB migration inventory and SQL source of truth are maintained
in `shared-supabase-db/supabase/migrations/`. The matching price-memo DB
contract is maintained in `db-contracts/price-memo.json`.

Only the protected, manually dispatched Writer workflows in
`shared-supabase-db` may apply migrations to hosted Dev/Prod databases.
`receipt-manager` has no legacy hosted Writer path, and price-memo has no hosted
DB Writer path. Application deploy workflows perform Reader-only compatibility
gates; they never apply migrations. Do not create, retain, mirror, or apply
shared DB migrations from price-memo, and do not run `db push` from this
repository.
Shared schema changes are a separate cross-repository task in
shared-supabase-db; do not edit receipt-manager or other repositories from a
price-memo task.

Dev and Prod Writer credentials have passed read-only connection/identity
verification. Applying a `PENDING` migration with the protected Writer
workflow has not yet been verified. Local SQL validation must use an isolated,
disposable PostgreSQL database or cluster, never a shared or hosted database.

## Git worktree and environment files

- The normal checkout is `~/web/price-memo`; additional worktrees belong under
  `~/worktrees/price-memo/<task-name>`.
- Create, list, inspect/reuse, and remove worktrees with `scripts/worktree.sh`.
  Run `scripts/worktree.sh list` before creating a worktree for an existing
  branch. If that branch is already checked out, inspect the listed worktree
  and reuse it; never force a second checkout.
- Create new worktrees with an explicit branch and base, for example
  `scripts/worktree.sh create <task> --branch <branch> --base origin/main`.
  Reuse an existing path with `scripts/worktree.sh reuse <path>`.
- Environment files stay outside Git under
  `~/.config/price-memo/<environment>/` and are linked into worktrees by the
  setup command. For initial migration from `~/web/price-memo`, first run
  `bash scripts/dev-env.sh migrate --preview`, then explicitly select only
  reviewed development files with `migrate --apply <relative-file> [...]`.
  Migration copies into new mode-0600 files under mode-0700 directories,
  retains every source, and never prints values or replaces a destination.
  Existing `.env.local` files and Vite key overlaps are reported by name only.
  Daily `npm run dev` validates the required Supabase settings, checks the
  managed `backend/.venv` runtime without `npm ci` or `uv sync`, and prepares
  missing links without installing dependencies or replacing local files.
  It checks the configured Vite/API ports before launch and supervises only
  the process groups it starts; occupied ports are never reassigned or killed.
  `scripts/worktree.sh setup` may run `uv sync --reinstall` only for a confirmed
  stale managed venv inside the worktree; unsafe virtualenvs are never deleted
  automatically.
  A symlink makes its target readable to any agent trusted with that workspace,
  so provide only development credentials needed for the task.
- `scripts/worktree.sh remove <path>` is an explicit, interactive operation for
  clean worktrees under `~/worktrees/price-memo/`. It never forces removal or
  deletes the branch. Check for active sessions and dev servers first. Worktrees
  under `/tmp` or `~/web` are not migrated or removed automatically.
- Claude Code desktop session worktrees under `.claude/worktrees/` are managed
  by the app. `scripts/worktree.sh` does not create or remove them.
- New branches based on `origin/main` fetch and validate the remote ref in
  `scripts/worktree.sh create`; failed fetches stop creation instead of falling
  back to a stale ref. Explicit bases and existing local branches do not fetch.
  Existing worktrees are reused without fetching or changing their branch.

## Implementation rules

- Never introduce TypeScript `any`.
- Preserve exact unit semantics and avoid guessed values.
- Follow existing architecture before adding abstractions.
- Prefer small focused changes.
- When changing shared A/B behavior, inspect the integration specification first.

## Commit subjects

- Follow Conventional Commits format: `<type>: <変更内容>`.
- Use lowercase English types and concise Japanese descriptions.
- Do not include custom task or phase identifiers.
- Do not rewrite existing commit history.

## UI verification

When frontend UI changes can affect layout, responsive behavior, styling, or
user interaction, verify the rendered application. Simple non-visual changes do
not require browser verification unless there is a specific reason. After
fixing a visual or interaction bug, verify the affected screen before
considering the task complete.

- Verify against the development server from `npm run dev`
  (`http://localhost:5173`) on desktop and mobile viewports. Do not stop or
  replace a server the session did not start.
- Use the browser tools available in the current Claude Code session.
- Never automate Google OAuth. Do not click app login buttons or otherwise
  drive OAuth re-authentication. Never read, inspect, print, copy into the
  repository, or include profile files, cookies, tokens, `localStorage`, or
  `sessionStorage` in prompts or logs.
- When an authenticated screen cannot be confirmed, stop and report exactly:
  `アプリ側は未認証、Google側のログイン状態は未確認`. Ask the human to sign in
  manually and do not continue until they confirm it.
- Never log out, clear site data, or clear browser storage in a browser profile
  shared with the human. Use a dedicated profile and a separate Dev test account
  for any real logout behavior check.
- If browser operation is unavailable, report UI behavior as UNCONFIRMED with
  the cause; never claim PASS.
