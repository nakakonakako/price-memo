# Worktree removal safety contract

## Purpose and scope

This document adopts the shared v1 safety contract for
`scripts/worktree.sh remove` in price-memo. It covers observable protections
around deleting a Git worktree, not the internal process-inspection design.
The contract is independent of the Cursor delegation monitor contracts
MON-01–08. It does not require a shared package, cross-repository CI, Cursor
session tracking, or process termination.

The acceptance conditions below retain the meaning defined by
receipt-manager. Test mappings identify evidence, not proof that every edge
case is exercised.

## Version and adoption status

Contract version: **v1 (adoption proposed by this PR)**. receipt-manager adopted
v1 in PR #58, merged at `ab515fb7570c113bd5035204e08ce027a394a996`; its contract
is the normative source. price-memo adoption takes effect only after this PR is
merged and its CI result is recorded.

| Repository | `origin/main` SHA | Status |
| --- | --- | --- |
| receipt-manager | `ab515fb7570c113bd5035204e08ce027a394a996` | v1 adopted by PR #58 |
| price-memo | `3b71cd06f34f37b8de39b0bd592082e9f6aebdd6` | adoption proposed by this PR |

The price-memo PID identity implementation was merged in PR #57 at
`3b71cd06f34f37b8de39b0bd592082e9f6aebdd6` (CI success was recorded for that
PR). Record this adoption PR URL, merge commit, and CI result here only after
merge and successful CI. Until then, do not describe both repositories as
having completed adoption.

## Contract v1: WT-01–WT-08

### WT-01 — Limit the deletion target

The remove command canonicalizes the requested directory, requires it to be
inside the repository's standard worktree area, and checks that its Git common
directory matches the invoking repository. Git's non-forced
`git worktree remove` is the final Git-level validation and deletion step.
Symlink aliases must resolve to the physical worktree path, and similar path
prefixes must not be treated as descendants.

The wrapper does not independently prove registration by comparing the target
against `git worktree list` or checking `--show-toplevel` equals the requested
path. Do not describe that preflight as an explicit registration proof. A
successful removal must still be accepted by Git as a removable worktree.

- **Implementation guarantee (実装保証):** `canonical_worktree()` in
  `scripts/worktree.sh`; path under the standard worktree area; Git common-dir
  match with the invoking repository; non-forced `git worktree remove` as the
  final Git step.
- **Tests (実テスト名):** `test_clean_remove_succeeds`,
  `test_symlink_alias_uses_canonical_worktree_path`,
  `test_similar_directory_not_matched`.
- **Verified scope (テストで確かめられる範囲):** Clean removal through the
  wrapper; canonical path handling and prefix non-matching in inspection.
- **Not exercised (未実施条件):** Full wrapper removal through a symlink alias;
  dedicated refusal tests for another repository or a path outside the standard
  area.
- **Price-memo additional guarantees (price-memo固有追加保証):** None beyond
  shared v1 WT-01.

### WT-02 — Protect uncommitted work

Refuse removal when `git status --porcelain` reports staged, unstaged, or
untracked changes. Use non-forced `git worktree remove`; do not delete the
branch. The contract does not claim that ignored files are enumerated by the
status precheck.

- **Implementation guarantee (実装保証):** Refuse when `git status --porcelain` is
  non-empty; non-forced `git worktree remove`; branch is not deleted.
- **Tests (実テスト名):** `test_dirty_worktree_still_rejected`,
  `test_clean_remove_succeeds`, `test_symlink_alias_uses_canonical_worktree_path`;
  clean/dirty remove cases in `scripts/test-worktree.sh`.
- **Verified scope (テストで確かめられる範囲):** Untracked dirty refusal; clean
  removal; branch retention in the shell clean-removal case.
- **Not exercised (未実施条件):** Separate staged-only and unstaged-only cases;
  ignored-file enumeration (outside the precheck guarantee).
- **Price-memo additional guarantees (price-memo固有追加保証):** None beyond
  shared v1 WT-02.

### WT-03 — Require explicit confirmation and inspect twice

Require the literal confirmation input `remove`. Run process inspection before
the prompt and again after confirmation immediately before deletion. If the
inspector reports a blocked process or an inspection error, stop without
calling Git removal.

- **Implementation guarantee (実装保証):** Literal `remove` confirmation; process
  inspection immediately before the prompt and again before `git worktree remove`;
  stop without Git removal on block or inspection error.
- **Tests (実テスト名):** `test_process_started_at_prompt_blocks_real_remove`,
  `test_proc_scan_failure_is_fail_closed`,
  `test_second_inspection_catches_new_process`; successful remove tests for the
  positive path.
- **Verified scope (テストで確かめられる範囲):** Second inspection after
  confirmation; `/proc` enumeration failure; process started while confirmation
  is pending.
- **Not exercised (未実施条件):** Wrong or cancelled confirmation input.
- **Price-memo additional guarantees (price-memo固有追加保証):** None beyond
  shared v1 WT-03.

### WT-04 — Detect live processes by cwd

Refuse removal when an inspectable, live process has a canonical cwd equal to
the target worktree or a directory below it. Ignore zombies. Do not match a
different worktree or a sibling whose name merely shares a path prefix.

- **Implementation guarantee (実装保証):** Block when an inspectable live process
  has canonical cwd in the target worktree or below; ignore zombies; do not match
  siblings or prefix-similar paths.
- **Tests (実テスト名):** `test_worktree_process_blocks_remove`,
  `test_subdir_cwd_detected`, `test_other_worktree_process_does_not_block_target`,
  `test_similar_directory_not_matched`,
  `test_cwd_sample_is_discarded_when_pid_exits_is_reused_or_zombifies`;
  also `test_external_process_does_not_block` and
  `test_stable_external_cwd_does_not_block` for non-target cwd.
- **Verified scope (テストで確かめられる範囲):** Target and subdirectory cwd;
  other worktree and external cwd non-blocking; prefix safety; zombie/reuse
  discard during cwd sampling.
- **Not exercised (未実施条件):** Non-Linux `/proc` behavior.
- **Price-memo additional guarantees (price-memo固有追加保証):** None beyond
  shared v1 WT-04.

### WT-05 — Confirm PID identity around cwd inspection

Do not attribute cwd to a process based on PID alone. For direct cwd
detection, sample `/proc/<pid>/stat`, read cwd, then sample stat again. Accept
the cwd observation only when the start time matches and both samples are
non-zombie. A change between other live states, such as sleeping and running,
is not by itself PID reuse. If the process exited, became a zombie, or the PID
was reused, discard the old cwd observation.

- **Implementation guarantee (実装保証):** `_same_process()` in
  `scripts/worktree-remove-inspect.py`; stat–cwd–stat with matching start time
  and non-zombie samples.
- **Tests (実テスト名):**
  `test_stable_cwd_identity_blocks_and_allows_process_state_changes`,
  `test_cwd_sample_is_discarded_when_pid_exits_is_reused_or_zombifies`.
- **Verified scope (テストで確かめられる範囲):** Stable start time across live
  state changes; discard on exit, zombie, or PID reuse during sampling.
- **Not exercised (未実施条件):** Exhaustive kernel timing races.
- **Price-memo additional guarantees (price-memo固有追加保証):** None beyond
  shared v1 WT-05.

### WT-06 — Handle inspection failures according to association evidence

Failure to enumerate `/proc` prevents safe inspection and refuses removal.
When evidence links a process to the target, failure to confirm the process
identity must not turn that evidence into permission to remove. Do not infer
that every unreadable PID belongs to the target; repository-specific stricter
checks are allowed and must be documented.

Price-memo currently behaves as follows:

- An unassociated PID's initial stat failure is skipped.
- If cwd is readable and lies in the target but the post-cwd stat cannot be
  read, inspection fails and removal is refused.
- A failed post-cwd stat recheck with an external or unreadable cwd and no
  recorded Cursor association is skipped.
- Recorded Cursor PID/group candidates have separate fail-closed checks; an
  associated process that cannot be inspected safely blocks removal.
- `/proc` enumeration failure refuses removal.

This intentionally differs from receipt-manager, which fails closed for an
initial same-user stat failure. Do not describe WT-06 as identical failure
handling across the repositories.

- **Implementation guarantee (実装保証):** Behavior bullets above; fail-closed on
  `/proc` enumeration failure; association-aware stat/cwd failures; recorded
  Cursor candidates fail closed when inspection is unsafe.
- **Tests (実テスト名):** `test_post_cwd_stat_failure_refuses_only_with_association_evidence`,
  `test_unassociated_initial_stat_failure_is_skipped`,
  `test_unrelated_unreadable_cwd_does_not_block`,
  `test_recorded_cursor_group_stat_recheck_failure_refuses`,
  `test_associated_process_inspection_failure_refuses`,
  `test_proc_scan_failure_is_fail_closed`.
- **Verified scope (テストで確かめられる範囲):** Skip vs refuse paths for
  unassociated initial stat failure, target cwd with failed recheck, unrelated
  unreadable cwd, recorded group recheck failure, associated inspection failure,
  and `/proc` scan failure.
- **Not exercised (未実施条件):** Every UID, permission, and timing combination.
- **Price-memo additional guarantees (price-memo固有追加保証):** Recorded Cursor
  PID/group/nonce association uses stricter fail-closed branches than
  receipt-manager's same-user initial-stat rule (documented difference above).

### WT-07 — Do not interfere with processes or expose their data

The guard never signals or kills a process and does not alter processes in
other worktrees. It must not print or persist environment-variable values or
full command lines. Printing a bounded PID list and generic inspection reasons
is permitted.

- **Implementation guarantee (実装保証):** No signals or kills; no changes to
  other worktrees' processes; no printed or persisted environment values or full
  command lines; bounded PID lists and generic reasons allowed.
- **Tests (実テスト名):** `test_worktree_process_blocks_remove`,
  `test_other_worktree_process_does_not_block_target`.
- **Verified scope (テストで確かめられる範囲):** Target and other-worktree
  processes remain alive after refusal paths exercised by those tests.
- **Not exercised (未実施条件):** Synthetic-secret output assertion; every
  diagnostic sink.
- **Price-memo additional guarantees (price-memo固有追加保証):** Marker read from
  `/proc/<pid>/environ` in memory for session nonce comparison only; values are
  not logged or persisted (receipt-manager does not perform this read).

### WT-08 — State the detection limits

The guard is a Linux `/proc` cwd check, not a complete process-tree ownership
system. It cannot generally detect an unrecorded process after cwd moves outside
the worktree. A PID whose inspection data is unreadable and whose relationship
to the target cannot be established may be skipped, so a related process can
be missed. A race remains between the final process inspection and Git removing
the worktree. The contract does not promise support on every OS, complete
process-tree detection, or automatic recovery after forced termination. The
guard never kills processes.

- **Implementation guarantee (実装保証):** Documented limits only; no promise of
  complete process-tree detection, arbitrary moved-cwd detection, or OS coverage
  beyond Linux `/proc` cwd inspection.
- **Tests (実テスト名):** `test_second_inspection_catches_new_process`;
  limitations narrative in `docs/worktree-development.md`.
- **Verified scope (テストで確かめられる範囲):** Process appearing while
  confirmation is pending is caught by the second inspection.
- **Not exercised (未実施条件):** Final inspection-to-`git worktree remove`
  race; general unrecorded process after cwd leaves the worktree.
- **Price-memo additional guarantees (price-memo固有追加保証):** Recorded Cursor
  session/group checks add partial moved-cwd/orphan coverage (see extension
  section); they do not close WT-08 gaps for arbitrary processes.

## Price-memo Cursor devserver extension (not required by v1)

The Cursor Playwright devserver adds protections beyond WT-01–WT-08 for a
recorded worktree session:

- recorded PID, PGID, SID, and process start time;
- a session nonce marker checked against the recorded session;
- detection of matching recorded group members after the leader exits;
- detection of recorded group members whose cwd has moved outside the
  worktree;
- rejection or invalidation of stale sessions and reused recorded PIDs;
- refusal when a recorded related process cannot be inspected safely.

For marker matching, the guard reads `/proc/<pid>/environ` into memory and
compares only the dedicated marker value with the session nonce. It does not
print or persist that environment value. This extension applies only to
processes associated with a valid recorded Cursor session/group; it does not
detect every arbitrary process whose cwd moves outside the worktree.
receipt-manager does not provide this extension because it has no equivalent
Cursor session issuer. These protections are not prerequisites for adopting
WT-01–WT-08.

Relevant price-memo tests include `test_stale_cursor_session_does_not_block`,
`test_reused_session_pid_does_not_trust_stale_group`,
`test_orphaned_cursor_group_child_with_moved_cwd`,
`test_recorded_cursor_group_stat_recheck_failure_refuses`, and
`test_associated_process_inspection_failure_refuses`, plus WT-06 companions
`test_post_cwd_stat_failure_refuses_only_with_association_evidence`,
`test_unassociated_initial_stat_failure_is_skipped`, and
`test_unrelated_unreadable_cwd_does_not_block`. All eight names exist as test
methods in `scripts/test-worktree-remove-guard.py` (25 methods total in that
file); listing them does not prove every timing or group race is covered.
`test_invalid_session_blocks_without_touching_file` and orphan harness cleanup
tests add further session coverage. These do not prove that every group race
or marker-read timing is covered.

## Test execution and coverage

CI path (verified in this repository): `npm run check` → `check:worktree` →
`bash scripts/test-worktree.sh` (which invokes
`python3 scripts/test-worktree-remove-guard.py` among other worktree-related
suites) plus additional scripts listed in `package.json` under
`check:worktree`.

The guard suite is `scripts/test-worktree-remove-guard.py` (**25** `test_*`
methods). It is called from `scripts/test-worktree.sh`, which is included in
`npm run check` through `check:worktree`. The table maps contract conditions to
observed tests; it does not upgrade untested edge cases to verified behavior.

| Contract | Price-memo tests | Verified scope and remaining coverage gaps |
| --- | --- | --- |
| WT-01 | `test_clean_remove_succeeds`; `test_symlink_alias_uses_canonical_worktree_path`; `test_similar_directory_not_matched` | Canonical path and clean removal. No full wrapper alias-removal test or dedicated other-repository/outside-root refusal test. Git non-forced remove remains final Git validation. |
| WT-02 | `test_dirty_worktree_still_rejected`; `test_clean_remove_succeeds`; `scripts/test-worktree.sh` clean/dirty checks | Untracked dirty refusal and clean removal/branch retention. Staged and unstaged cases are not individually covered; ignored-file behavior is outside the precheck guarantee. |
| WT-03 | `test_process_started_at_prompt_blocks_real_remove`; `test_second_inspection_catches_new_process`; `test_proc_scan_failure_is_fail_closed` | Second inspection and inspection failure refusal. Wrong/cancelled confirmation has no dedicated regression case. |
| WT-04 | `test_worktree_process_blocks_remove`; `test_subdir_cwd_detected`; `test_other_worktree_process_does_not_block_target`; `test_similar_directory_not_matched`; `test_cwd_sample_is_discarded_when_pid_exits_is_reused_or_zombifies` | Target/subdirectory, sibling, prefix, and zombie/reuse behavior. Other OS `/proc` behavior is untested. |
| WT-05 | `test_stable_cwd_identity_blocks_and_allows_process_state_changes`; `test_cwd_sample_is_discarded_when_pid_exits_is_reused_or_zombifies` | Stable starttime, live state transition, exit, reuse, and zombie samples. No exhaustive kernel race testing. |
| WT-06 | `test_post_cwd_stat_failure_refuses_only_with_association_evidence`; `test_unassociated_initial_stat_failure_is_skipped`; `test_unrelated_unreadable_cwd_does_not_block`; `test_recorded_cursor_group_stat_recheck_failure_refuses`; `test_associated_process_inspection_failure_refuses`; `test_proc_scan_failure_is_fail_closed` | Tested skip/refuse distinctions. Not every UID/permission or timing combination is represented. |
| WT-07 | `test_worktree_process_blocks_remove`; `test_other_worktree_process_does_not_block_target` | Processes remain alive on refusal and when another worktree is inspected. No synthetic-secret output assertion; no separate test for every diagnostic sink. |
| WT-08 | `test_second_inspection_catches_new_process`; limitations in `docs/worktree-development.md` | Prompt-time race is covered; final inspection-to-remove race and arbitrary moved-cwd process detection cannot be fully tested or guaranteed. |

## Allowed implementation differences

The repositories may keep different process-inspection and failure-handling
code. Both use the shared observable conditions above, while stricter behavior
and known skip cases stay explicit. receipt-manager's stricter initial
same-user stat handling and price-memo's recorded Cursor session/group/nonce
extension are implementation differences; do not remove either protection
just to make the code look alike, and do not claim receipt-manager has the
Cursor extension.

## Adoption and contract updates

1. Treat WT-01–WT-08 meanings as versioned acceptance conditions. A semantic
   change requires a new contract version; do not silently redefine v1 in one
   repository.
2. Review implementation and test evidence in both repositories before
   proposing a change. Keep app-specific behavior in each repository's own
   tests and docs.
3. Create independently reviewable PRs in each repository. Do not use one
   worker or one PR to modify both repositories.
4. For each adoption or update, record the contract version, comparison base
   SHA, PR URL, merge commit, CI result, and untested conditions. Update the
   adoption record only after that repository's PR is merged and CI is green.
5. Do not add external-repository CI dependencies or a shared library solely
   to enforce this documentation contract.

This worktree-removal contract is separate from the Cursor delegation monitor
contracts MON-01–08.
