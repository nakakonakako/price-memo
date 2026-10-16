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

説明の要点（実装と一致させる）:

- 保存対象は B 側4テーブル相当の手動入力データと、その利用目的（単価比較・買い物メモ等）
- Google OAuth / Supabase Auth と Supabase への保存。任意のレシート明細検索時のみ A 行を読み取り参照
- ブラウザメモリ上の画面状態・Supabase セッション・localStorage の補助用途を、断定しすぎず記載
- 現行 price-memo から Gemini へデータを送らない
- 自動削除・保持期限なし。個別削除と一括 RPC の範囲
- ログアウトは DB 削除しない。削除はログアウトしない
- 一括削除は Auth アカウントと A データを対象外
- バックアップ・運用ログの即時消去は約束しない

## 4. migrationの管理

共有Supabase DBのmigration正本は `receipt-manager/supabase/migrations/`。price-memo側はmigrationを保持せず、DBへのpushも行わない。
