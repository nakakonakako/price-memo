# 仕様: データ管理

最終更新: 2026-10-16

関連: [project-overview.md](./project-overview.md) / [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md)

## 1. price-memoデータの全削除

データ管理タブから、ログイン中のユーザーが自身のprice-memoデータを任意のタイミングで削除できる。自動削除・保持期限による削除は行わない。

対象テーブルは `price_memo_items`、`price_records`、`price_folders`、`price_stores`。`public.delete_my_price_memo_data()` は引数を受けず、`auth.uid()` と既存RLSでユーザーを限定する。4テーブルの削除を1回のRPC内で行い、失敗時はPostgreSQLのトランザクションにより全件ロールバックする。関数は `SECURITY INVOKER`、空の `search_path` で、実行権限は `authenticated` のみに付与する。

削除後もSupabase Authのアカウントとログインセッションを維持する。receipt-manager側のレシート・CSV・チャットデータおよび他のユーザーの行には触れない。価格記録からレシート明細への参照は削除される価格記録側にあるため、レシートデータ自体は残る。

## 2. 確認と結果

- 操作前に4テーブルの範囲と復元できないことを表示し、最終確認ダイアログを出す。
- 実行中は送信を無効化する。
- エラー時は成功扱いにせず、汎用エラーを表示する。
- 成功時は店舗キャッシュを無効化し、買い物メモ・フォルダ・値段推移の画面状態を再生成して買い物メモへ戻る。セッションは維持する。
- RPC応答前に認証ユーザーが切り替わった場合、完了結果を切替先ユーザーの画面に反映しない。

## 3. データの取り扱い（ユーザー向け説明）

ログイン前（認証画面）とログイン後（データ管理画面）の両方から、同じ「データの取り扱い」ダイアログを開ける。本文は `frontend/src/features/data-management/components/DataHandlingDisclosureContent.tsx` に一元化し、`DataHandlingDisclosure` が `DialogShell` で表示する。

説明の要点（ユーザー向け本文と一致させる。3 節構成）:

1. **取得する情報と利用目的** — 商品フォルダ・店舗・価格記録（購入日・価格・数量・単位・任意メモ）・買い物メモの保存と、単価比較・価格推移・店舗別管理・買い物メモへの利用
2. **データの保存先と外部サービス** — Supabase DB と利用者単位のアクセス制限、Google 認証と Supabase Auth、ログイン維持情報のブラウザ保存と利用中の一時保持、レシート明細検索時のみの購入履歴参照、Gemini への非送信
3. **データの保持と削除** — 自動削除・保存期限なし、個別削除とデータ管理の一括削除、DB 上の削除対象とバックアップ・運用ログの残存可能性

## 4. migrationの管理

共有Supabase DBのmigration inventoryの正本は `shared-supabase-db/supabase/migrations/`。これはmigration本文と履歴を照合する基準であり、本番Writerの運用移管完了を意味しない。receipt-managerの本番deploy.ymlには旧Writer apply jobが残っており、運用移管は未完了。旧Writerを無効化するまではshared-supabase-dbのProd Writerによる実適用を開始しない。price-memo側はmigrationを保持・適用せず、DBへのpushも行わない。

本番deploy workflowはshared-supabase-dbのReader actionを使い、price-memoのデプロイ対象commitに対応するDB契約、Prod DB identity、shared migration履歴の`IN_SYNC`をbuild前に検証する。検証に失敗した場合はimage build/pushとdeployを行わない。詳細なEnvironment設定、実行順序、失敗時の確認手順は [project-overview.md](./project-overview.md#73-本番docker-compose--github-actions) を参照する。
