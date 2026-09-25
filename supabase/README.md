# Supabase

`receipt-manager` と `price-memo` は同じ Supabase DB プロジェクトを利用します。

## Database migrations

- 共通 DB migration の唯一の正本は `receipt-manager/supabase/migrations/` です。
- `price-memo` 固有テーブルの schema 変更も `receipt-manager` 側へ migration を追加します。
- DB への push は `receipt-manager` 側からのみ実行します。
- `price-memo` 側では migration を保持・ミラー・push しません。

適用済み migration の履歴は共通 DB で管理します。migration ファイルと DB の運用手順は `receipt-manager` リポジトリを参照してください。

OAuth リダイレクトには `price-memo` の本番オリジンを追加してください（Supabase Dashboard → Auth）。
