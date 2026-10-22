# Worktree and environment workflow

## Standard locations

- Main checkout: `~/web/price-memo`
- Additional worktrees: `~/worktrees/price-memo/<task-name>`
- Local environment files: `~/.config/price-memo/<environment>/`

Existing worktrees under `/tmp`, `~/.cursor/worktrees`, and `~/web` are left in
place. Do not migrate or remove them automatically.

## Commands

```bash
scripts/worktree.sh list
scripts/worktree.sh create <task-name> --branch <branch-name> --base origin/main
scripts/worktree.sh reuse <path>
scripts/worktree.sh setup <path> --environment development
scripts/worktree.sh remove <path>
```

`create` creates a Git worktree under the standard directory and runs dependency
and environment setup. If its branch is already checked out elsewhere, the
command displays the worktree list and stops; inspect that worktree and pass its
path to `reuse`. `reuse` displays the branch, status, staged/unstaged summaries,
and untracked paths before running setup. It preserves all existing changes.

Setup installs dependencies from the root and frontend lockfiles, creates or
repairs backend dependencies only when needed, and ensures `backend/.venv` is a
managed directory inside the worktree. If a moved worktree left stale absolute paths in the interpreter or
`uvicorn` shebang, setup may run `uv sync --reinstall` for that managed venv
only. Symlinked or otherwise unsafe virtualenvs are never deleted automatically;
setup stops and prints exact recovery steps instead. Setup also creates absolute
symlinks for configured `.env`,
`frontend/.env`, `frontend/.env.local`, and `backend/.env` files. The source
files must be regular files under `~/.config/price-memo/<environment>/` with
the same relative paths.
Missing sources are skipped during worktree setup. Existing target files or
conflicting links are never replaced. Environment values are never printed or
copied into Git.

## Initial environment migration and daily startup

The one-time migration reads only file metadata and variable names during its
preview. It checks `~/web/price-memo/.env`, `frontend/.env`,
`frontend/.env.local`, and `backend/.env`, and shows each destination and any
existing-destination conflict without displaying values:

```bash
bash scripts/dev-env.sh migrate --preview
bash scripts/dev-env.sh migrate --apply frontend/.env
```

Pass only files reviewed as development-only credentials. The command asks for
an explicit `copy` confirmation, copies selected files to new destinations
with mode `0600` inside mode `0700` directories, and retains source files. It
never overwrites a destination. A `frontend/.env.local` value that overlaps a
key in `frontend/.env` is reported by key name and blocks startup until the
override is resolved. Do not place production credentials in this shared
directory: Cursor workers with trusted access to a linked workspace can read
the linked files.

Root `npm run dev`, `npm run dev:playwright`, and `npm run devserver:ensure`
run a lightweight environment preflight before starting. It prepares missing
symlinks, validates that the effective Vite and backend Supabase URLs target
the approved development project, requires `VITE_SUPABASE_URL` and the
publishable key in the effective Vite environment plus `SUPABASE_URL` in the
effective backend environment, and validates the managed
`backend/.venv` interpreter and `uvicorn` shebang without running `npm ci` or
`uv sync`, refuses conflicting local files, and prints exact recovery steps
when automatic backend repair would be unsafe. The ordinary Vite server is
fixed to `5173` with `strictPort`; the official Playwright server remains on
`5273` with `strictPort`. Before launch, a supervisor checks both selected
ports and reports listener PID, command, and working directory when available;
occupied ports stop startup without choosing another port or stopping their
owners. The supervisor runs each server in its own session and cleans up only
groups it started on Ctrl+C, SIGTERM, or startup failure. After shutdown, the
ports can be reused. The normal development ports remain `5173` and `8001`;
Playwright uses `5273` and `8001`.

The Cursor Playwright `devserver:ensure` path validates both effective URLs on
every invocation. It reuses a running service pair only when a versioned
session record matches the canonical worktree and current Dev configuration,
the recorded PID/PGID/session/start time still match, and `ss` identifies every
listener as a process in the recorded groups carrying that launch's private
session marker. HTTP readiness is checked only after process ownership has
been proven. A shared lock serializes ensure and stop across worktrees. The
session stores no environment values or credentials; its configuration
fingerprint is a digest used only to detect changes.

Ports occupied by another worktree, an unrecorded process, an old or malformed
session, a partial startup, or a process whose owner cannot be inspected are
never reused or stopped automatically. `devserver:stop` signals only verified
groups recorded for the current canonical worktree. If ownership cannot be
proven, inspect the listener manually and stop it explicitly; do not delete a
session record to bypass the guard. Sessions written by older versions are
not reusable. The official MCP, pinned browser, and browser profile remain
unchanged.

A symlink does not hide its target from a trusted Cursor workspace. Configure
only development credentials required by the task. Do not link production
credentials into a worker workspace.

`remove` only accepts a clean, registered worktree below
`~/worktrees/price-memo/`, prompts for the literal word `remove`, and uses
non-forced `git worktree remove`. It does not delete the branch. Check for active
workers and dev servers first. It never runs automatically after a PR is merged.

## Cursor delegation

`scripts/delegate-cursor.sh --worktree <task-name>` creates or reuses the
standard Git worktree and invokes Cursor with `--workspace <absolute-path>`.
For a new worktree it fetches `origin/main` and uses that exact ref as its base;
fetch failure stops creation, with no fallback to the current branch. Existing
worktrees are reused without fetch or branch changes.
Use `--workspace <path>` to continue work in a listed worktree. Cursor's own
`--worktree` option is not used because it controls a separate storage root.
The retained `--continue-worktree` option is an alias for `--workspace`.

`npm run devserver:ensure`, Playwright MCP, the shared browser profile, and
Tailscale Serve keep their existing behavior. `npm run dev` and
`npm run dev:playwright` use the owned-process supervisor; worktree setup does
not start or stop development servers.
