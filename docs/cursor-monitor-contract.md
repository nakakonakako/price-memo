# Cursor委譲monitor共通契約 v2

この文書は、receipt-managerとprice-memoのCodex → Cursor委譲monitorで
共通して保証する外部動作です。共通ライブラリや同一の内部実装は
要求しません。price-memoでは、この文書と下記の独立した契約テストを
`npm run check`に含めて適用します。

共通契約の正本はreceipt-managerの
[docs/cursor-monitor-contract.md](https://github.com/nakakonakako/receipt-manager/blob/main/docs/cursor-monitor-contract.md)
です。receipt-manager PR #54の取り込みcommitは
`f7972c98c49d7854ec9371043421dcdd57e0f76f`です。

## 契約

| ID | 受け入れ条件 | 正常・異常時の扱い |
|---|---|---|
| MON-01 | Workerプロセスの終了コードと最後に認識したCursor `result` eventの両方を成功判定に使う | 終了コード0、`success` result、エラーでない状態が揃った場合だけ成功。result欠落・エラー・不正な成功状態・非0終了は失敗 |
| MON-02 | `VERIFICATION RESULTS`ブロックから`COVERAGE`と`PASS` / `FAIL` / `UNCONFIRMED`を解析する | Workerの終了成功と検証coverageを別々に示す。不正・欠落・矛盾・切り詰められた検証情報をPASSに推定しない |
| MON-03 | stream-jsonを行単位で上限付き処理する | 不正JSONと未知eventの内容は露出せず安全に無視する。長すぎる行は破棄して次の行から再開し、上限内のEOF終端行は処理する。入力上限を超えた結果を成功根拠にしない |
| MON-04 | 通常進捗の表示量に上限を設ける | 進捗洪水を抑制し、抑制数と最終結果を表示する。終了・失敗・中断・状態保存失敗・verificationなどの重要通知は通常進捗上限で隠さない |
| MON-05 | 内部メッセージ、ツール引数・結果、未加工出力を無制限に表示・保存しない | 既知の秘密パターンとテスト用環境secretを可能な範囲でマスクし、報告と診断情報にサイズ上限を設ける。マスクは網羅的ではないため、残る情報も機密として扱う |
| MON-06 | 同一workspaceの重複実行を排他する | canonical pathで相対パス・symlink aliasによる回避を防ぐ。別workspaceは並行実行可能。正常終了・異常終了・中断後はlockを解放する |
| MON-07 | SIGINT / SIGTERMによる中断を処理する | シグナルは当該monitorが起動したWorkerのprocess groupだけに送り、中断を成功と報告しない。他workspaceのWorkerには作用させない |
| MON-08 | 状態・診断の保存量、権限、保持範囲を制限する | 未加工のWorker出力を無制限に永続化しない。保存先・ファイルの権限を検査し、保存・削除は対象monitorの安全な所有範囲に限る。保存方式はrepoごとに異なってよい |

## price-memoのテスト対応

契約テストはfake Workerと隔離state directoryを使い、Cursor APIやGitHub Actionsの
特定refに依存しません。`npm run check`の`check:worktree`から
`python3 scripts/test-delegate-cursor-monitor.py`を実行します。

| 契約 | 対応テスト |
|---|---|
| MON-01 | `scripts/test-delegate-cursor-monitor.py`: `test_missing_result_and_invalid_json_are_failures`, `test_zero_exit_with_error_result_is_failure`, `test_success_subtype_with_error_flag_is_not_success`, `test_success_result_with_nonzero_worker_exit_is_failure` |
| MON-02 | 同: `test_missing_final_result_event_keeps_process_result_and_verification_separate`, `test_report_over_64_kib_is_unconfirmed_even_when_captured_prefix_says_pass`, `test_missing_and_malformed_verification_reports_are_unconfirmed`, `test_verification_heading_is_required`, `test_status_lines_outside_verification_block_are_not_formal_results`, `test_duplicate_and_conflicting_criteria_make_coverage_unconfirmed`, `test_normal_single_verification_block_reports_complete_coverage`, `test_unclosed_verification_block_keeps_statuses_unscoped`, `test_mcp_tool_completion_does_not_create_a_pass_finding` |
| MON-03 | 同: `test_stdout_line_boundaries_match_receipt_monitor`, `test_unterminated_stdout_eof_counts_oversize_once_and_parses_small_json`, `test_event_and_tool_semantics_match_receipt_monitor`, `test_oversized_stream_line_is_discarded_without_unbounded_output`, `test_unterminated_oversized_stdout_does_not_block_stderr_or_eof_cleanup` |
| MON-04 | 同: `test_progress_cap_keeps_final_report_and_signal_notifications_visible`, `test_progress_flood_keeps_final_result_and_report`, `test_signal_notice_is_visible_after_progress_limit`, `test_signal_during_oversized_line_is_forwarded_and_releases_lock` |
| MON-05 | 同: `test_success_prints_allowlisted_progress_and_bounded_sanitized_report`, `test_failure_saves_only_restricted_allowlisted_metadata`, `test_secrets_in_prioritized_findings_remain_masked`, `test_report_over_64_kib_is_unconfirmed_even_when_captured_prefix_says_pass` |
| MON-06 | 同: `test_same_workspace_and_symlink_alias_are_exclusive_but_other_workspaces_run`, `test_main_checkout_duplicate_delegation_is_rejected`, `test_failure_retention_prunes_only_own_regular_records`, `test_signal_during_oversized_line_is_forwarded_and_releases_lock` |
| MON-07 | 同: `test_sigint_and_sigterm_are_forwarded_to_only_the_child_group`, `test_interrupt_does_not_affect_another_workspace_worker`, `test_signal_during_oversized_line_is_forwarded_and_releases_lock` |
| MON-08 | 同: `test_failure_saves_only_restricted_allowlisted_metadata`, `test_failure_retention_prunes_only_own_regular_records`, `test_symlink_state_directory_fails_closed`, `test_unterminated_oversized_stdout_does_not_block_stderr_or_eof_cleanup` |

launcher回帰確認として、同じ`check:worktree`が
`python3 scripts/test-delegate-cursor-cli.py`と
`python3 scripts/test-delegate-cursor-origin.py`も実行します。監視の契約外となる
launcherのtask-file解決、worktree provenance、各tier・trust・MCP指定を維持します。

## price-memo固有の状態・診断保存

price-memoはreceipt-managerのstatus JSON方式を採用せず、失敗・中断時に
allowlist済みmetadataだけを保存します。Workerのraw stdout/stderr、report本文、
tool引数・結果、stderr本文は保存しません。診断categoryとbyte/count情報は保存します。

- 保存先: `$XDG_STATE_HOME/price-memo/delegate-cursor/`。未設定時は
  `~/.local/state/price-memo/delegate-cursor/`
- 最終directory: current user所有、mode `0700`。unsafe pathやsymlinkは拒否
- failure record: regular file、mode `0600`、最大8 KiB。exclusive/no-follow作成
- retention: 最大20件、最大7日。削除対象はmonitor固有命名の所有regular fileのみ
- lock: canonical workspace pathのhashを使うmode `0600`のprivate lock。monitor終了時にOSが解放
- 成功時はfailure recordを作らない。失敗記録の保存失敗はWorker outcomeを変えない

report本文はメモリ内で最大64 KiBを解析し、既知形式とsecret名らしい環境変数の値を
best-effortでマスクして、出力を最大4 KiBに制限します。stderrは最大4 KiBの行単位で
error categoryだけを抽出し、本文は表示・保存しません。通常進捗は最大300行で、
最終結果・verification・重要な失敗/中断通知は別枠で出力します。

## 未検証事項と保証の限界

- Cursor実API・アカウント認証・外部ネットワークは契約テストで実行しません。
- secret maskingは既知形式・テスト値へのbest-effortです。未知形式、分割された値、
  任意のユーザー入力の完全検出を保証しません。
- signalテストは同一OS上のfake Worker process groupで確認します。全OS・全外部
  プロセス構成、強制kill、電源断時の回復までは保証しません。
- ファイルシステム障害・プロセスクラッシュの全タイミング、実環境でのstate保存
  復旧は網羅しません。
- byte上限、保持件数・期間などの実値はprice-memo固有の設定であり、他repoの値と
  同一であることを意味しません。

## 契約の更新手順

共通動作を変える場合はreceipt-managerの正本で契約versionとIDの意味を更新し、
両repoへ独立したPRで反映します。各PRでテスト対応、`npm run check`、PR CIを確認し、
採用状況をrepoごとのPR/commit SHAとCI結果で記録します。片側のPRだけで両repoが
準拠したとは扱いません。共有package、外部repo参照CI、両repoをまとめて変更する
Workerは追加しません。

## MON-09: 明示的な利用枠切れと引き継ぎ

対応テスト: `test_usage_exhaustion_requires_failed_cli_diagnostic`,
`test_usage_words_in_worker_result_are_not_cli_evidence`,
`test_usage_failure_keeps_partial_workspace_and_does_not_retry`

失敗時に観測済み CLI の `ActionRequiredError` と明示的な利用枠切れ文言を
stderr から検出し、`cursor_usage_exhausted` を報告する。ANSI と分割入力を
扱い、成功・中断・通常の文章や容量不足だけでは判定しない。Supervisor は
再試行せず、既存変更を保護して同じ worktree で引き継ぐ。構造化 quota エラーの
外部形式は未確認であり推測しない。
