# price-memo DB 統合テスト対象

`price-memo.json` は shared-supabase-db DB contract v1 によるカタログ上の静的検査条件を宣言する。以下は v1 のカタログ検査では実動作を保証できないため、使い捨ての Supabase/PostgreSQL 統合環境で別途検証する。

- RLSの `USING` / `WITH CHECK` 式が本人の行だけを許可し、別Authユーザーの行を拒否すること
- Auth/JWT claimを使った SELECT / INSERT / UPDATE / DELETE とユーザー間分離。特に `receipts` / `receipt_items` の `PUBLIC` policy と `auth.uid()` の実動作
- `rename_price_store` の店舗名更新、price_recordsへの同期、未認証・他ユーザー・重複名等の戻り値/エラー/原子性
- `reorder_price_memo_items` の期待順比較、並べ替え結果、`PM001` / `22023` のエラーと同時実行時の原子性
- `delete_my_price_memo_data` がログイン中のユーザーの4テーブルだけを削除し、Authと他ユーザーのデータを保持すること
- `receipt_items!inner(... receipts ...)` のPostgREST埋め込みJOINが複合FKで解決されること
- Realtime private channelの認証、topicごとのユーザー分離、4テーブル変更時の実配信と再取得動作

v1はpolicy名/command/roleだけを確認し、policy式は比較しない。FKは列・参照列・ON DELETE action・検証状態を確認するが、複合FKの列単位 `ON DELETE SET NULL` 対象列は検査しない。ACL v1のprivilege一覧にPostgreSQL 17の`MAINTAIN`がないため、その拒否状態もJSON契約では検査できない。Realtimeは`realtime.messages`の存在/RLS、関数シグネチャ、trigger名/有効状態を確認するが、policy式、trigger関数への結び付き、Realtime publication/configuration、配信結果は保証しない。関数検査も属性とシグネチャまでで、関数本体や業務結果を保証しない。

## 実装・migration上の根拠

- テーブルread/writeと`select('*')`: `frontend/src/features/folders/api/foldersApi.ts`、`frontend/src/features/records/api/recordsApi.ts`、`frontend/src/features/stores/api/storesApi.ts`、`frontend/src/features/memo/api/memoApi.ts`
- 価格記録・店舗・レシート参照型: `frontend/src/features/records/types/index.ts`、`frontend/src/features/folders/types/index.ts`、`frontend/src/features/stores/types/index.ts`
- Auth/JWTによる現在ユーザー取得: `frontend/src/lib/supabase.ts`、各APIの`supabase.auth.getUser()`呼び出し
- 共有レシートJOIN: `frontend/src/features/records/api/recordsApi.ts` の `receipt_items` と `receipts!inner(...)` query
- Private topic/event/payload: `frontend/src/lib/priceMemoRealtime.ts`、`frontend/src/lib/externalSync.ts`
- 価格表定義と初期RLS/ACL: `shared-supabase-db/supabase/migrations/20260826100000_price_folders_and_records.sql`、`20260828200000_price_memo_items.sql`、`20260828210000_price_stores.sql`
- 並べ替え/店舗改名RPC: `shared-supabase-db/supabase/migrations/20261010010000_s1_08_atomic_price_operations.sql`
- owner-scoped composite FKと一意制約: `shared-supabase-db/supabase/migrations/20261009010000_owner_composite_foreign_keys.sql`
- receipt参照列と基礎RLS: `shared-supabase-db/supabase/migrations/20260824183225_remote_schema.sql`、`20260825100000_remove_memo_and_is_comparable.sql`
- 一括削除RPC: `shared-supabase-db/supabase/migrations/20261016100000_delete_my_price_memo_data.sql`
- Realtime policy/trigger/function: `shared-supabase-db/supabase/migrations/20261018120000_price_memo_private_broadcast.sql`
- Data API role ACL: `shared-supabase-db/supabase/migrations/20261015120000_s1_f01_revoke_excess_table_privileges.sql`、`shared-supabase-db/supabase/diagnostics/verify_s1_f01_acl_integrity.sql`

契約検証器は現行のshared-supabase-db main commit `e61b5ff83539dca53cf21c8321f507480dea248c` に固定して形式検証した。これは形式確認のみであり、Dev/Prodへの接続やカタログ照合を行った結果ではない。

ACL v1の対応privilege一覧にはPostgreSQL 17の`MAINTAIN`がない。そのため既存ACL診断が確認する`MAINTAIN`拒否はJSON契約で表せず、shared検証器の対応拡張後に追加する。
