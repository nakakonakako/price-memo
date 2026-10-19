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

Setup installs dependencies from the root and frontend lockfiles, syncs backend
dependencies, and creates absolute symlinks for configured `.env`,
`frontend/.env`, and `backend/.env` files. The source files must be regular files
under `~/.config/price-memo/<environment>/` with the same relative paths.
Missing sources are skipped. Existing target files or conflicting links are
never replaced. Environment values are not printed or copied into Git.

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
Use `--workspace <path>` to continue work in a listed worktree. Cursor's own
`--worktree` option is not used because it controls a separate storage root.
The retained `--continue-worktree` option is an alias for `--workspace`.

`npm run dev`, `npm run devserver:ensure`, Playwright MCP, the shared browser
profile, and Tailscale Serve keep their existing behavior. Worktree setup does
not start or stop development servers.
