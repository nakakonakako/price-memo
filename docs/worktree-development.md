# Worktree and environment workflow

The shared worktree-removal safety contract v1 and its price-memo test mapping
are documented in [worktree-remove-contract.md](worktree-remove-contract.md).
The contract describes observable removal protections and known detection
limits; it does not standardize the internal process-inspection implementation.

## Standard locations

- Main checkout: `~/web/price-memo`
- Additional worktrees: `~/worktrees/price-memo/<task-name>`
- Local environment files: `~/.config/price-memo/<environment>/`

Existing worktrees under `/tmp` and `~/web` are left in
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
and environment setup. When it creates a **new** branch with the default base
`origin/main` (exactly that ref, including the implicit default), it first
completes existing-worktree and in-use-branch checks, then fetches
`refs/heads/main` into `refs/remotes/origin/main`, verifies
`origin/main^{commit}`, and only then runs `git worktree add`. Fetch failure,
a missing refspec, or an invalid commit stops without creating a worktree or
branch; there is no fallback to a stale local `origin/main` or the current
branch. Explicit `--base main`, any other `--base` ref, checkout of an existing
local branch, and `reuse` do not fetch or reset anything.

If its branch is already checked out elsewhere, the command displays the
worktree list and stops; inspect that worktree and pass its path to `reuse`.
`reuse` displays the branch, status, staged/unstaged summaries, and untracked
paths before running setup. It preserves all existing changes.

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

Before dependency setup, `worktree.sh` checks existing managed environment
paths against the selected `~/.config/price-memo/<environment>/` sources.
Missing links are allowed at this stage for a new worktree. Invalid links,
regular files at managed paths, stale links without a source, and unexpected
`.env*` paths in the repository root, `frontend/`, `backend/`, or
`backend/app/` stop setup before npm or uv runs. Symlinks and non-directories
in any parent component of the configured settings path or these dotenv lookup
directories are rejected. `backend/app/services/` is intentionally outside
price-memo's dotenv lookup scope. After setup links are prepared, a strict
check requires each configured source to have its exact symlink and
each unconfigured source to have no target. Manual `--environment` selections
remain supported. A managed link must be an absolute symlink whose direct
`readlink` target exactly equals the selected source path. Relative and
indirect symlinks are rejected even when they resolve to the same file. These
checks inspect names, file types, and symlink targets; they never read
environment file contents or repair existing paths.

The recognized managed paths match this repository's current dotenv use:
root `.env`, frontend `.env` and `.env.local`, and backend `.env`. The validator
also rejects other `.env*` files in the Vite and Python dotenv lookup
directories, including mode-specific Vite dotenv files and `backend/app/.env`.
Resolve any rejected path manually; setup does not remove or overwrite it.

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
directory: agents with trusted access to a linked workspace can read the
linked files.

Root `npm run dev` runs a lightweight environment preflight before starting. It prepares missing
symlinks, validates that the effective Vite and backend Supabase URLs target
the approved development project, requires `VITE_SUPABASE_URL` and the
publishable key in the effective Vite environment plus `SUPABASE_URL` in the
effective backend environment, and validates the managed
`backend/.venv` interpreter and `uvicorn` shebang without running `npm ci` or
`uv sync`, refuses conflicting local files, and prints exact recovery steps
when automatic backend repair would be unsafe. The ordinary Vite server is
fixed to `5173` with `strictPort`. Before launch, a supervisor checks both selected
ports and reports listener PID, command, and working directory when available;
occupied ports stop startup without choosing another port or stopping their
owners. The supervisor runs each server in its own session and stops only groups
it started on Ctrl+C, SIGTERM, or startup failure. It confirms group exit after
SIGTERM and, when needed, after SIGKILL. If ownership or exit cannot be
confirmed, or `/proc` inspection fails, cleanup reports an error and returns a
failure status. The development ports remain `5173` and `8001`.

A symlink does not hide its target from a trusted agent workspace. Configure
only development credentials required by the task. Do not link production
credentials into an agent workspace.

`remove` only accepts a clean worktree below `~/worktrees/price-memo/` whose
Git common directory matches this repository, prompts for the literal word
`remove`, and uses non-forced `git worktree remove`. The preflight does not
independently prove registration via `git worktree list`; Git's non-forced
remove remains the final validation. It does not delete the branch. It never
runs automatically after a PR is merged.

Before the confirmation prompt and again immediately before `git worktree remove`,
`scripts/worktree-remove-inspect.py` scans for processes still using the target
worktree. The check is fail-closed: it never kills or changes processes, never
prints environment values or full command lines, and refuses removal when an
inspection failure affects a process linked to the target worktree.

What is inspected:

- Any live process whose resolved working directory lies inside the canonical
  worktree path (boundary-safe `realpath` comparison; similar path prefixes do
  not match). The process identity is sampled from `/proc/<pid>/stat` before
  and after reading cwd. The start time must match and both samples must be
  non-zombie; a state transition such as sleeping to running is allowed. If the
  process exited, became a zombie, or the PID was reused during the sample, the
  old cwd observation is discarded. A target cwd followed by an unreadable
  stat recheck refuses removal; an unassociated process whose identity cannot
  be rechecked is not assumed to belong to this worktree.
- `/proc` enumeration must succeed. An unreadable `cwd` or stat on a PID with no evidence linking it to the target
  does not by itself block removal, since Linux restricts some unrelated
  process inspection. If a target cwd has already been observed but its stat
  identity cannot be rechecked, removal is refused.

Removal is refused when:

- staged, unstaged, or untracked changes remain;
- any inspected process is still active in the worktree;
- `/proc` cannot be enumerated;
- a process with a target cwd cannot be rechecked safely.

What to do when removal is refused:

- Stop development servers and other work started in that worktree (stop
  `npm run dev` / supervisors you started there), end shells or jobs whose working directory is
  inside the worktree, then run `scripts/worktree.sh remove` again.
- When inspection itself fails, confirm manually that no listener or job still
  uses the worktree before retrying.

Ordinary cwd scanning cannot detect a general process after it moves cwd
outside the worktree. If a PID has unreadable inspection data and no evidence
links it to the target, the guard skips it, so a related process may be missed.
A short race also remains between the final inspection and `git worktree
remove`; a process started in that window may not be detected. The guard never
kills processes.
Conversely, a process that exits immediately after inspection may still leave
the worktree removable even though work was active moments earlier. The guard
reduces accidental removal; it does not replace checking active sessions and
servers yourself.

`npm run dev` uses the owned-process supervisor; worktree setup does not start
or stop development servers.
