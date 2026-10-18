# 仕様: 他端末変更のRealtime通知

最終更新: 2026-10-18

関連: [project-overview.md](./project-overview.md) / [spec-shopping-memo.md](./spec-shopping-memo.md) / [spec-folders-catalog.md](./spec-folders-catalog.md) / [spec-trends.md](./spec-trends.md)

## 1. 通知契約

receipt-manager PR #24 が定義するPrivate Broadcast契約を利用する。price-memo側ではDB migrationやRealtime設定を管理しない。

| 項目 | 契約 |
|------|------|
| Topic | `price-memo:user:<小文字のUUID>` |
| Event | `price-memo-change` |
| Channel | `private: true` |
| Payload | `table`, `operation` のみ |
| 対象テーブル | `price_folders` / `price_records` / `price_memo_items` / `price_stores` |
| 操作 | `INSERT` / `UPDATE` / `DELETE` |

クライアントはpayloadの行データを画面へ適用しない。許可されたテーブルと操作だけを受理し、既存Supabase APIで再取得する。

## 2. 購読と再取得

- `AuthenticatedApp` ごとにユーザー固有のPrivateチャンネルを1つ購読する
- ユーザーIDはtopic用に小文字化する。同じユーザーのトークン更新では購読と画面状態を維持し、Supabase JSのRealtime認証更新に任せる
- ログアウト、ユーザー切替、アンマウント時に古い購読を解除し、遅れて届くコールバックを無視する
- `SUBSCRIBED` のたびに4テーブルを無効化して再取得し、初回購読・再接続前のイベント欠落を補う
- 50ms以内のイベントはテーブル集合にまとめる。取得中に新しい通知が来た場合は完了後にもう一度取得する
- 表示中の画面は該当データを再取得する。keep-alive中の非表示画面はテーブル集合を保留し、表示時に再取得する
- 画面更新は既存のgeneration、ユーザー照合、tombstoneを通す。フォーム下書き、検索条件、展開状態を保つ
- 店舗一覧は共有キャッシュをforce取得し、既存のローカルcatalog revisionとは別の通知でStoreFieldとフォルダ画面へ反映する

| テーブル | 再取得範囲 |
|----------|------------|
| `price_folders` | メモのフォルダ・掲載項目・掲載フォルダ記録、フォルダ一覧・全記録、値段推移のフォルダ一覧 |
| `price_records` | メモ掲載フォルダ記録、フォルダ画面の全記録・件数・詳細、表示中の推移記録 |
| `price_memo_items` | 買い物メモ |
| `price_stores` | 店舗共有キャッシュと店舗入力候補 |

フォルダ削除などの関連テーブル変更は複数通知をまとめて同じ再取得範囲へ反映する。保存元の端末にも同じ通知が届く可能性があるため、再取得は既存の世代管理を通し、ローカルrevisionを外部通知の代わりに使わない。

## 3. 接続障害と整合性

購読失敗や切断は通常操作を止めない。Realtime Broadcastは履歴付き変更ログではないため、再接続時の `SUBSCRIBED` 再取得と既存の `resumeSync` を整合性回復のフォールバックとする。再取得が失敗した場合は既存データを残し、次回のBroadcast、再接続、またはアプリ復帰で再試行する。

本番DBはreceipt-manager PR #24 のmigrationが未適用のため、Private channelの認可・送信設定と通知トリガーが有効になるまでは自動反映されない。適用前にprice-memoの購読コードを本番データ同期の保証として扱わない。

この通知機構は変更検知と再取得のみを行い、同一価格記録のCAS、楽観的排他制御、自動マージを提供しない。BL-02第3段階BのCASは未実装のまま。

## 4. 検証上の制約

モックテストは通知のtopic、event、payload検証、ユーザー分離、集約、再取得対象を検証する。実際の2端末間Realtime検証にはPR #24適用済みの隔離Supabase環境が必要であり、本番DBでは検証しない。
