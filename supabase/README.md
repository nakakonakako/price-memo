# Supabase

`receipt-manager` と `price-memo` は同じ Supabase DB プロジェクトを利用します。

## Database migrations

- 共有DBのmigration inventoryとSQLの唯一の正本は `shared-supabase-db/supabase/migrations/`、price-memoのDB契約正本は `db-contracts/price-memo.json` です。
- hosted Dev/Prod DBへのmigration適用は、shared-supabase-dbの保護された手動Writer workflowだけが担当します。
- receipt-managerに旧Writer経路はなく、price-memoにもhosted DB Writer経路はありません。各アプリのdeploy workflowはReaderによるDB契約・identity・migration履歴の検証だけを行い、migrationは適用しません。
- Dev/Prod Writer資格情報のread-only接続・identity検証は成功済みです。保護Writerによる`PENDING` migrationの実適用は未検証です。
- ローカルSQL検証は隔離された使い捨てPostgreSQL database/clusterだけで行います。共有DBやhosted DBを検証先にしません。
- `price-memo` 側ではmigrationを作成・保持・ミラー・push・適用しません。

適用済みmigration履歴、Writer workflow、承認・適用手順は `shared-supabase-db` を参照してください。

OAuth リダイレクトには `price-memo` の本番オリジンを追加してください（Supabase Dashboard → Auth）。
