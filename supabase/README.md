# supabase CLI

方針（確定）:
- A（receipt-manager）と **同一** の Dev / Prod プロジェクトへ link する
- Auth は共有。詳細は `docs/project-overview.md` §3
- 無関係な新規アプリ用 DB は Supabase を増やさず、VPS の PocketBase 等で扱う

## migrations の扱い

同一リモートの migration 履歴を揃えるため、次を置いている。

| ファイル | 所有者 |
|----------|--------|
| `20260824183225_remote_schema.sql` | A（履歴ミラー。編集しない） |
| `20260825100000_remove_memo_and_is_comparable.sql` | A（履歴ミラー。編集しない） |
| `20260827100000_price_records_free_units.sql` | **B が正。A にもコピー** |
| `20260828100000_sort_order.sql` | **B が正。フォルダ／記録の表示順** |

現状、`db push` は A リポ側の link / DB パスワードが安定している。B 用テーブルを足すときは:

1. SQL を本リポで書く
2. 同じファイルを `receipt-manager/supabase/migrations/` にもコピー
3. A リポで `npm run db:push`

A 側で新しい migration が増えたら、履歴ミラーを本リポにもコピーする。

## 適用済み

- 2026-08-28: Dev へ `sort_order` 適用済み
- 2026-08-26: Dev（`irgahixsuvtopiwmtkku`）へ `price_folders` / `price_records` 適用済み
- Prod へは別途同じ migration を push すること

OAuth のリダイレクトに B のオリジンを足すこと（Supabase Dashboard → Auth）。
