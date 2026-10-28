# Supabase

`receipt-manager` と `price-memo` は同じ Supabase DB プロジェクトを利用します。

## Database migrations

- 共通 DB migration の唯一の正本は `shared-supabase-db/supabase/migrations/` です。price-memoのDB契約正本は `db-contracts/price-memo.json` です。
- `price-memo` 側ではmigrationを作成・適用しません。
- 本番・開発DBへの現行Writer経路は `receipt-manager` が保持し、shared DB管理権限の移管までは既存の適用手順を維持します。
- DB への push は `receipt-manager` 側からのみ実行します。
- `price-memo` 側では migration を保持・ミラー・push しません。

適用済み migration 履歴とSQLの正本・読み取り検証手順は `shared-supabase-db` を参照してください。現行Writer workflowの実行条件は `receipt-manager` の運用手順を参照してください。

OAuth リダイレクトには `price-memo` の本番オリジンを追加してください（Supabase Dashboard → Auth）。
