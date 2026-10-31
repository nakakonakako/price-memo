# 厳密単価比較（price-memo）— プロジェクト概要

> **このリポジトリは機能 B（厳密単価比較）である。**  
> レシート管理（機能 A）は隣リポジトリ `receipt-manager`。分離方針は [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md) を参照。

| 項目 | 内容 |
|------|------|
| リポジトリ名 | `price-memo` |
| プロダクト名（UI・仮） | 単価メモ / Price Memo |
| ドキュメント最終更新 | 2026-10-31 |
| 文書の扱い | **生きた概要**。機能の追加・削除・方針変更のたびに本ファイルを更新する |

---

## この文書の更新ルール

機能や環境が変わったら、最低限次を直す。

1. **§4 機能一覧** … 追加 / 削除 / ステータス変更
2. **§5 データモデル** … テーブル・主要カラムの増減
3. **§6 技術スタック / §7 環境** … 依存や起動手順の変化
4. **§10 変更履歴** … 日付と一行要約を追記

機能画面に操作ヒント（「タップすると…」等）を足す場合は **使い方タブ**（[spec-guide.md](./spec-guide.md)）を更新し、機能コンポーネント側には書かない。

詳細な設計判断は別 md（`docs/spec-*.md` など）に切り出し、ここからはリンクする。

---

## 1. 目的

**ユーザーが意図して選んだ商品だけを、確定した重量・個数・容量で厳密に記録し、単価で比較する（統計アプリ）。**

- 主用途は手動フォルダに入れた商品の単価推移・店舗別の絞り込み閲覧
- 店頭では **買い物メモ**（過去統計の一覧＋その場の単位換算試算）。値札 OCR は本流にしない
- 買わなかった観察価格も、統計データとして残してよい
- 必要時のみ A のレシート明細を参照（任意下書き／参照）。A なしでも完結する
- 「家計の支出記録」や「AI による自動カテゴリ」は **目的に含めない**（→ 機能 A）

店頭フローの詳細: [spec-shopping-memo.md](./spec-shopping-memo.md)

---

## 2. スコープ（A / B）

| | 機能 A（`receipt-manager`） | 本プロジェクト（B） |
|--|-----------------------------|---------------------|
| 目的 | 支出の記録・検索・管理 | 意図した商品だけの厳密単価比較 |
| カテゴリ | AI / 学習の `main` / `sub` | **手動フォルダのみ** |
| 単価・重量 | 扱わない | g / 個 / ml 等の **確定データのみ** |
| 値段推移・店頭判断 | 置かない（削除済み） | **値段推移＋買い物メモ**（OCR 店頭照会は非本流） |
| 連携 | B を知らない | A のレシート DB を **一方向参照** |

詳細: [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md)

---

## 3. アーキテクチャ概要（方針・確定）

### 3.1 DB / Auth 配置

| 決定 | 内容 |
|------|------|
| A と B | **同一 Supabase プロジェクト**（既存の Dev / Prod 各1）。B 用テーブルを足す |
| マイグレーション | 共有DBのmigration inventoryとSQLの正本は `shared-supabase-db/supabase/migrations/`、アプリ別DB契約は各アプリの `db-contracts/`。hosted DBへの適用はsharedの保護Writer workflowだけが担当。receipt-managerに旧Writer経路はなく、price-memoにもhosted Writer経路はない。アプリdeployはReader gateによる検証のみ |
| Auth | **共有**（同じ `auth.users` / 同じ Google OAuth）。アプリ入り口（URL・SPA）は分けるが、アカウントは分けない |
| 将来の無関係アプリ | Supabase 枠は増やさない。VPS 上の **PocketBase** などで別運営 |

**入り口が別 ≠ ユーザー DB が別。** 同じ人が A と B にログインすると同じ `user_id` になる。レシート紐付け（一方向参照）に必要で、個人利用でも自然。

B の認証済み画面状態は `session.user.id` 単位で保持し、ユーザーが切り替わるとタブ・keep-alive 画面・入力状態を破棄する。同じユーザーのトークン更新では画面状態を維持する。ユーザー固有の店舗キャッシュも認証ユーザー切替時に破棄し、旧世代の非同期結果はキャッシュや画面へ反映しない。

データ管理画面から、ログイン中の本人がB側の4テーブル（`price_folders`、`price_records`、`price_memo_items`、`price_stores`）を一括削除できる。AuthアカウントとA側レシートデータは削除せず、成功後にBの画面状態・店舗キャッシュを初期化する。ログイン前（認証画面）とログイン後（データ管理）の両方から、同じ「データの取り扱い」説明ダイアログを開ける。詳細は [spec-data-management.md](./spec-data-management.md)。

分離したいのは次だけ:

- UI・デプロイ・リポジトリ（すでに別）
- テーブルと RLS（B は `folders` 等、A の明細は読むだけ）
- 「B を開いていない人に B の UI を出さない」（URL が別なら足りる）

同じプロジェクトで Auth だけ二重化する手段は事実上なく、分けるなら別 Supabase プロジェクトが必要（今回は採らない）。

```
[A SPA] ──┐                    ┌─ receipts / receipt_items（A）
           ├── Supabase Auth ──┤
[B SPA] ──┘   同一 user_id     └─ folders / price_records（B）
                                      └── receipt_item_id で A を参照
```

```
Browser (React / Vite SPA) … A / B で別ホスト可
  │  Supabase Auth（Google OAuth・A と同一プロジェクト）
  │  ブラウザからの API は同一オリジンの `/api`（開発は Vite プロキシ、本番は nginx）
  ▼
FastAPI (uvicorn :8001 ※A は :8000) … **CORS は有効化しない**（クロスオリジン API 契約なし）
  │  x-supabase-token → ユーザー単位の Supabase クライアント
  │  （将来 OCR を足す場合のみ GEMINI_API_KEY。店頭本流ではない）
  ▼
Supabase（A の Dev または Prod）
  ├── A テーブル（receipts 等）… B は参照のみ
  └── B テーブル（folders 等）… migration正本は shared-supabase-db。hosted適用は保護Writer workflowのみ
```

| 層 | パス | 役割 |
|----|------|------|
| フロントエンド | `frontend/` | SPA。機能は `src/features/` 以下 |
| バックエンド | `backend/app/` | FastAPI |
| DB・Auth | `supabase/` | Supabase 設定。migrationは保持せず、共通migration正本はshared-supabase-db、price-memo契約は`db-contracts/` |
| ドキュメント | `docs/` | 本ファイルおよび仕様メモ |

---

## 4. 機能一覧

ステータス凡例:

- **スキャフォールド** … ディレクトリ / プレースホルダのみ
- **未着手** … 仕様はあるが実装なし
- **現行** … 動いている（今後）

### 4.1 UI（予定タブ）

| 画面 | ラベル（仮） | ステータス | 概要 |
|------|--------------|------------|------|
| `memo` | 買い物メモ | **現行** | 店頭用ピン留めリスト。掲載フォルダの記録のみロード。新規追加は先頭。開いたカードからフォルダ詳細へ移動できる。詳細は [spec-shopping-memo.md](./spec-shopping-memo.md) |
| `folders` | フォルダ | **現行** | 品目名／店名カタログ、直近プレビュー＋詳細一覧、横断検索。詳細は [spec-folders-catalog.md](./spec-folders-catalog.md) |
| `trends` | 値段推移 | **現行（スマホのみ）** | 独立タブ。`lg` 以上では非表示（フォルダタブの分割パネルに統合） |
| `howto` | 使い方 | **現行** | 機能説明・操作ヒント。詳細は [spec-guide.md](./spec-guide.md) |
| `records` | （旧）記録 | **廃止** | フォルダの「＋」モーダルに統合 |
| `link` | （旧）レシート紐付け | **廃止** | 独立タブ削除。任意下書きは記録追加モーダル内に残す |
| `inquiry` | 店頭照会（OCR） | **延期** | 値札 OCR。本流にしない → [spec-shopping-memo.md](./spec-shopping-memo.md) |

### 4.2 機能モジュール（予定）

| 領域 | パス（予定） | ステータス | できること |
|------|--------------|------------|------------|
| 買い物メモ | `frontend/src/features/memo/` | **現行** | `price_memo_items`。`listRecordsForFolders`。タブ keep-alive + catalogSync |
| フォルダ・店舗 | `frontend/src/features/folders/` + `stores/` | **現行** | カタログ・プレビュー・詳細。`storesCache` / `catalogSync` |
| 厳密レコード | `frontend/src/features/records/` | **現行** | `RecordForm`。`ensureStore`（キャッシュ経由） |
| 値段推移 | `frontend/src/features/trends/` | **現行** | `FolderTrendPanel`（lazy + Recharts）。PC はフォルダ内、スマホは独立タブ |
| 使い方 | `frontend/src/features/guide/` | **現行** | `HowToPage`。操作説明は機能画面ではなくここに集約 |
| A 参照 | `RecordForm` 内のレシート下書き検索 | **現行** | 独立タブ・`receipt-link` モジュールは削除済み |
| 店頭 OCR | — | **延期** | 値札 OCR（非本流）。`inquiry` プレースホルダ削除済み |

### 4.3 バックエンド API

スキャフォールド時点ではヘルスチェックのみ。現行のフォルダ／レコード／推移／A 検索は FE から Supabase 直。買い物メモも同様を想定。OCR を入れる場合のみ BE + Gemini。

| Method | Path | 認証 | 用途 | ステータス |
|--------|------|------|------|------------|
| GET | `/` | 不要 | ヘルスチェック | スキャフォールド |

### 4.4 カテゴリ（B）

- **手動フォルダのみ**。AI 自動カテゴリは作らない・持ち込まない。
- A の `main_category` / `sub_category` は紐付け検索の手がかりには使えるが、B の棚にはしない。

---

## 5. データモデル

B 固有テーブル。RLS・`user_id` 分離。migration正本はshared-supabase-db（下表）。hosted適用はsharedの保護Writer workflowのみ。Dev/Prod Writer資格情報のread-only接続検証は成功済みだが、`PENDING` migrationの実適用は未検証。price-memo の必要DB契約は `db-contracts/price-memo.json`

| テーブル | 概要 | 主なカラム | 備考 |
|----------|------|------------|------|
| `price_folders` | 手動フォルダ（品目名） | `name`, `sort_order`, `user_id`（`name` 一意） | 末尾 `()` / `（）` で読みソート可。表示は読み非表示 |
| `price_stores` | 店舗名カタログ | `name`, `user_id`（`name` 一意） | 記録保存時に `ensureStore`。入力は `StoreField` |
| `price_memo_items` | 買い物メモの掲載 | `folder_id`, `sort_order`, `user_id`（`folder_id` 一意） | フォルダ削除で CASCADE。メモから外すだけなら行削除 |
| `price_records` | 厳密レコード | `folder_id`, `recorded_at`, `store_name`, `price`, `amount`, `unit`, `sort_order`, `receipt_item_id?` | `store_name` は `price_stores` と整合。単位は自由文字列 |

A 参照（読み取り・紐付け用）:

| テーブル | 用途 |
|----------|------|
| `receipts` / `receipt_items` | `price_records.receipt_item_id` → `receipt_items.id`（ON DELETE SET NULL）。B から A 行は更新しない |

---

## 6. 技術スタック（方針・A に揃える）

### フロントエンド

| 技術 | 目安 |
|------|------|
| React | ^19 |
| TypeScript | ~5.9 |
| Vite | ^7 |
| Tailwind CSS | ^4 |
| Axios | ^1 |
| @supabase/supabase-js | ^2 |
| Recharts | ^3.8（値段推移） |

### バックエンド

| 技術 | 目安 |
|------|------|
| Python | >=3.10（実行は 3.12 想定） |
| FastAPI / Uvicorn | A と同系。ブラウザは `/api` 同一オリジン経由のみ（CORS ミドルウェアなし） |
| supabase (Python) | A と同系 |
| google-genai | OCR を将来足す場合のみ（店頭本流ではない） |
| uv / Ruff | パッケージ・lint |

### デプロイ

| 技術 | 目安 |
|------|------|
| Docker Compose | `docker-compose.production.yml`（FE + BE） |
| GitHub Actions | PR（`main` 向け）で品質チェック。`main` push → GHCR → VPS（frontend は外部 `edge` network 経由） |
| nginx | SPA + `/api` → backend |

---

## 7. 環境・起動

### 7.1 ローカル開発

通常の人間向け開発・ブラウザー確認は `npm run dev` の `http://localhost:5173` を使う。Cursor worker の Playwright MCP 検証は下記の専用手順を使い、5273 の事前起動は不要。

```bash
npm install
cd frontend && npm install
cd ../backend && uv sync
cd .. && npm run dev
```

- Vite が `/api` を `http://localhost:8001` へプロキシ（A の 8000 と併走可能）
- `npm run dev`、`npm run dev:playwright`、`npm run devserver:ensure` は起動前にViteとbackendの実効Supabase URLを承認済みDev project refへ照合する。URL欠落・不一致・曖昧なdotenv設定は値を表示せず停止する
- `npm run dev` は起動前にVite `:5173` とFastAPI `:8001` を検査し、競合時は所有プロセス情報を表示できる範囲で表示して停止する。別ポートへの自動切替や既存プロセスの終了は行わず、Ctrl+C・SIGTERM・片側起動失敗時はこの起動が作成したサーバープロセス群だけを停止する。SIGTERM後に終了確認し、必要なSIGKILL後も期限付きで再確認する。所有権・終了状態・`/proc` のいずれかを確認できない場合はcleanup失敗をstderrと終了コードに反映する
- Cursor / Playwright MCP のローカル UI 確認は `npm run devserver:ensure` で `:8001` / `:5273` を起動し、ブラウザーは `http://localhost:5273` に固定する（Vite `strictPort`）。同一worktreeの起動時Dev検証記録、PID/PGID/session/starttime、worktree識別子、実listener所有者、現在の接続設定を照合できた完全なセッションだけ再利用する。起動直後の所有権未確認プロセスは検証前記録として扱い、所有者を証明できない場合はkillせず記録を保持して停止する。停止時はpidfd取得・シグナル送信の失敗を成功扱いせず、プロセス群とポートの消滅を確認できた場合だけセッション記録を削除する。所有者不明・別worktree・旧形式・片側停止・接続設定変更時は再利用せず、別プロセスを終了しない。ensure/stopは全worktree共通ロックで直列化し、通常の `npm run dev:playwright` は `:5273` / `:8001` を使い、別の競合検査・プロセス終了管理を行う
- Playwright MCP はユーザー home 配下の共通 persistent profile を利用する。初回 Google OAuth はブラウザー上で手動実施し、main checkout と worktree からの確認は逐次実行する。詳細は [cursor-delegation.md](./cursor-delegation.md)
- Playwright MCP / Playwright / Chromium revision は `.cursor/playwright-mcp.sh` で固定し、browser binary はユーザー共通 cache を利用する。更新手順は [cursor-delegation.md](./cursor-delegation.md)
- DB: A と同じ Supabase プロジェクトを利用。migration正本は `shared-supabase-db`。ローカルSQL検証は隔離された使い捨てPostgreSQLを使用。hosted DBへの適用はsharedの保護Writer workflowに限り、price-memoはmigrationを保持・適用しない

### 7.2 環境変数

追加worktreeの保存先、環境変数symlink、依存関係セットアップ、Cursor委譲の手順は [worktree-development.md](./worktree-development.md) を参照。

**フロント**（A の Dev/Prod と同じ値でよい。本番は Docker build-arg）

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_URL`（本番は `/api`）

**バック**（VPS 上 `.env`。デプロイ時に Actions が umask 077 の下で0600を確認し、同じディレクトリの一時ファイルから原子的に置換）

- `SUPABASE_URL` / `SUPABASE_KEY`

`.env` は gitignore 対象。OAuth のリダイレクト URL は A / B それぞれのオリジンを Supabase ダッシュボードに追加する。

### 7.3 本番（Docker Compose + GitHub Actions）

A（`receipt-manager`）と同型。

`main` 向け Pull Request では `.github/workflows/ci.yml` が `npm run check` を実行する。本番 Secrets、Docker image の push、デプロイ、DB 接続・migration は行わない。本番の `.github/workflows/deploy.yml` は`main` push時にquality成功後、`production-db-preflight`を実行し、両方の成功後だけimageをbuild/pushする。deployはquality、DB検証、buildの全成功を要求し、SCP直前にも対象SHAが最新mainであることを確認する。

| 項目 | 内容 |
|------|------|
| トリガー | `main` への push |
| Build | GHCR へ `price-memo-frontend` / `price-memo-backend` |
| Deploy | SCP → `~/price-memo`、compose pull & up |
| Network | frontend はアプリ専用 `default` と外部 `edge`、backend は `default` のみ。前段 `edge-proxy` が Docker DNS の `price-frontend:80` に接続 |
| Host ポート | frontend / backend ともに公開しない。前段 reverse proxy は外部 `edge` network 経由で接続 |
| Migration | **本パイプラインではしない**。hosted Dev/Prodへの適用はshared-supabase-dbの保護Writer workflowだけが担当 |

DBゲートはshared-supabase-dbのcomposite actionを完全SHA固定で呼び、デプロイ対象commitのprice-memo契約、Prod DB identity、shared migration履歴`IN_SYNC`をReaderで検証する。不一致・接続/設定エラー・migration履歴が`IN_SYNC`以外ならbuildとdeployへ進まない。actionはReader専用でmigration適用や業務データ読取をしない。Dev/Prod Writer資格情報のread-only接続・identity検証は成功済みだが、保護Writerによる`PENDING` migrationの実適用は未検証。price-memo自身はmigrationを保持・適用しない。

本番DBゲートを有効にする前に、GitHub Settings → Environmentsで`production-db-check`を作成し、deployment branchを`main`だけに制限する。Environment Variablesには`PROD_SUPABASE_POOLER_HOST`（本番Supabaseのpooler hostname）と`PROD_SUPABASE_PROJECT_REF`（`fsrbddgyysssqzyullrc`）、Environment Secretには専用Reader LOGIN `migration_preflight_login.<project-ref>`の`MIGRATION_READER_PASSWORD`を設定する。Writer資格情報は登録・参照しない。Reader LOGINとSecretの対応、pooler接続設定、identity markerは別途承認された運用記録で確認し、値をworkflow logへ出さない。EnvironmentのRequired reviewersを利用する場合は既存の本番承認運用に従って設定する。初回のEnvironment設定後、main pushは検証から通常の自動デプロイまで継続するため、マージ前に設定とReader接続準備を完了する。未設定ならDBゲートがfail-closedし、build/deployはskipされる。

actionを更新する場合は、shared-supabase-dbへの変更がmainにマージされた後、そのmerge commitの完全40桁SHAでdeploy workflowの`uses`を更新してPR CIで検証する。検証失敗時はworkflow runの`production-db-preflight`ログを上から確認し、契約取得/形式、Reader設定不足、DB identity marker、shared migration履歴（`IN_SYNC`必須）、price-memo契約の`STATIC PASS`のどの段階かを切り分ける。DB契約不一致はprice-memo側の契約とアプリcommitを確認し、履歴不一致はshared側のread-only migration checkを使う。price-memoからmigrationを適用せず、資格情報値をログへ貼り付けたり、Writer接続を試したりしない。

必要な GitHub Secrets（A と共用できるものは同じ値でよい）:

- `PROD_SUPABASE_URL` / `PROD_SUPABASE_PUBLISHABLE_KEY`
- `VPS_HOST` / `VPS_USER` / `SSH_PRIVATE_KEY`

初回のみ VPS で `~/price-memo` を用意し、GHCR から pull できること（パッケージ公開 or `docker login`）を確認する。


### 7.4 開発作業の委譲

Codex CLI の通常 supervisor は GPT-6 Luna medium。高リスク・複雑な設計判断は
read-only の GPT-6 Sol `sol_supervisor` subagent へ早期エスカレーションし、
最終判断と実装委譲は Luna が行う。通常実装は Cursor CLI worker に
`scripts/delegate-cursor.sh` で委譲する。詳細は
[cursor-delegation.md](./cursor-delegation.md) を参照。price-memo の shared
Supabase migration は作成・保持・適用しない。migration正本は
`shared-supabase-db/supabase/migrations/`、hosted適用はsharedの保護Writer workflowのみ。契約本文は `db-contracts/price-memo.json` に置く。

---

## 8. ディレクトリガイド

```
price-memo/
├── frontend/          # React SPA（Dockerfile あり）
│   └── src/
│       ├── components/
│       ├── features/      # memo, folders, records, trends, guide, …
│       ├── lib/             # kanaSearch, listOrder, …
│       └── contexts/
├── backend/               # FastAPI scaffold（Dockerfile あり）
│   └── app/
├── nginx-config/          # 本番 SPA + /api プロキシ
├── docker-compose.production.yml
├── .github/workflows/deploy.yml
├── supabase/              # Supabase CLI 設定（migration inventoryの正本は shared-supabase-db）
├── docs/
└── package.json           # concurrently で FE+BE
```

---

## 9. 関連ドキュメント

| 文書 | 内容 |
|------|------|
| [README.md](./README.md) | docs 索引 |
| [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md) | A/B 分離方針 |
| [spec-shopping-memo.md](./spec-shopping-memo.md) | 買い物メモ（店頭リスト・統計・試算） |
| [spec-data-management.md](./spec-data-management.md) | price-memoデータの本人による一括削除 |
| [spec-folders-catalog.md](./spec-folders-catalog.md) | フォルダタブ（品目名・店名・記録 UI） |
| [spec-trends.md](./spec-trends.md) | 値段推移（グラフ・店舗一覧） |
| [spec-realtime-sync.md](./spec-realtime-sync.md) | 他端末変更のPrivate Broadcast通知と再取得 |
| [spec-guide.md](./spec-guide.md) | 使い方タブ |
| [cursor-delegation.md](./cursor-delegation.md) | Codex Luna/Sol と Cursor worker の委譲手順 |
| `../receipt-manager/docs/project-overview.md` | A の生きた概要（隣リポジトリ） |

---

## 10. 変更履歴（このドキュメント）

| 日付 | 内容 |
|------|------|
| 2026-10-31 | shared-supabase-dbをmigration正本・唯一のhosted Writer経路として明記し、Reader deploy gateと未検証のPENDING実適用状態を反映 |
| 2026-10-22 | Cursor検証サーバーの起動直後プロセスを追跡し、所有権未確認プロセスのkill禁止と停止完了確認を強化 |
| 2026-10-22 | 開発・Playwright起動前にVite/backendのDev Supabase接続先を検証し、接続先不明な既存UI検証サーバーの再利用を拒否 |
| 2026-10-22 | Cursor UI検証サーバーの同一worktree再利用にプロセス所有権・起動設定照合と排他ロックを追加 |
| 2026-10-18 | Private Broadcast通知から表示中画面と店舗キャッシュを再取得。再接続時とアプリ復帰時の同期を維持 |
| 2026-10-18 | BL-02 第3段階のうち、0件更新・削除を対象なしとして扱うフロント保護を追加（同時編集CASはDB側RPC待ち） |
| 2026-10-18 | BL-02 第1段階: `resumeSync` で復帰時に Supabase から再取得（`catalogSync` revision とは別経路） |
| 2026-10-16 | フォルダ削除通知で買い物メモの対象カードを即時同期 |
| 2026-10-16 | 認証画面とデータ管理画面から共通の「データの取り扱い」説明ダイアログを表示 |
| 2026-10-16 | ヘッダーから開くデータ管理画面で、ログイン中の本人がprice-memoの4テーブルを削除可能に |
| 2026-10-10 | `main` 向け Pull Request の品質チェック workflow を追加 |
| 2026-10-10 | S1-03: バックエンドの CORS ミドルウェアを除去。ブラウザ API は同一オリジン `/api`（Vite / nginx）のみ |
| 2026-10-10 | S1-07: 本番 deploy の `.env` から未使用の `GEMINI_API_KEY` 注入を除去。必須 Secrets 一覧を現行利用に合わせて更新 |
| 2026-10-19 | worktreeの`backend/.venv`管理・移動後のstale修復、起動前バックエンドruntime検証を追加 |
| 2026-10-27 | 新規worktree作成時の`origin/main`鮮度fetchを`worktree.sh`に集約し、delegate側の二重fetchを除去 |
| 2026-10-19 | Git worktree環境設定の明示移行、起動前検証、`origin/main`基準のCursor worktree作成を追加 |
| 2026-10-23 | 開発サーバーの所有プロセス群について、SIGKILL後の終了確認とcleanup失敗の報告を追加 |
| 2026-10-08 | 認証済み画面状態と店舗キャッシュをユーザーIDで分離し、切替前の非同期結果を破棄 |
| 2026-10-07 | 買い物メモの開いたカードから、フォルダタブの品目詳細へ移動できる |
| 2026-10-07 | Cursor worker 向け `npm run devserver:ensure` / `devserver:stop` を追加。`:8001` / `:5273` の起動・再利用と per-worktree 状態管理 |
| 2026-09-27 | Cursor / Playwright UI 確認用に Vite の固定ポート 5273 とユーザー home 配下の共通 persistent profile を追加 |
| 2026-09-26 | Codex Luna/Sol supervisor と Cursor worker の委譲基盤を追加。shared migration は receipt-manager に限定 |
| 2026-09-26 | 本番 Compose を receipt-manager と同じ `default` + 外部 `edge` 構成に統一。Deploy で frontend / backend の running を検証 |
| 2026-09-26 | 店舗カタログの変更を `storesCache` と `catalogSync` の revision で StoreField・keep-alive 画面へ同期 |
| 2026-09-26 | 共通 DB migration の正本を receipt-manager に一本化。price-memo 側は migration を保持せず、push もしない |
| 2026-09-08 | 本番 CD 初版: Docker Compose + GitHub Actions。旧構成では host :8081 を公開。migration はパイプライン外（A 側 / 適用済み） |
| 2026-09-06 | パフォーマンス: タブ keep-alive、メモは掲載フォルダの記録のみ、catalogSync、storesCache、recharts lazy。メモ新規は一覧先頭 |
| 2026-09-06 | フォルダ: 直近3件プレビュー＋詳細、横断検索、記録は購入日降順（並べ替えなし）。ScrollToTop。PCゴミ箱はドラッグ中のみ |
| 2026-09-06 | フォルダ: 詳細ビュー（仮）・検索横断統合 |
| 2026-09-01 | 値段推移: 店舗一覧化・グラフ絞り込み。使い方タブ。かな検索。メモUI整理。単位その他インライン。スワイプ引き切り削除。機能画面から操作ヒント撤去 |
| 2026-08-29 | PC で値段推移タブ非表示（フォルダ分割パネルに一本化）。推移展開アニメーション改善。記録複製・フォルダ間移動 |
| 2026-08-29 | 買い物メモ: 店名入力で統計を店舗スコープに切替。フォルダタブ分割推移パネル。死コード削除 |
| 2026-08-28 | 並べ替え DB 永続（`sort_order`）。記録・レシート紐付けタブ廃止。フォルダに記録追加モーダル。UI から A/B 表記を排除 |
| 2026-08-27 | 買い物メモ: 追加削除・入力順・自由単位・複数単位統計・保存のシームレス更新 |
| 2026-08-27 | 買い物メモ実装（統計＋行内試算＋任意保存）。初期タブに配置 |
| 2026-08-27 | 買い物メモを店頭の主に。OCR 店頭照会は延期。目的を単価統計アプリとして明確化 |
| 2026-08-26 | A 連携は任意下書き／事後参照。記録は購入日・店・値段・数量で完結（A 待ち禁止） |
| 2026-08-26 | A 明細検索→厳密レコード紐付けタブ（初版） |
| 2026-08-26 | 値段推移タブ（単価グラフ・店舗比較） |
| 2026-08-26 | 厳密レコード（`price_records`）登録・編集・削除 UI |
| 2026-08-26 | `price_folders` / `price_records` migration 追加。フォルダ CRUD（Auth 共有・RLS 直） |
| 2026-08-26 | DB は A と同一 Supabase（CLI）。Auth 共有・入り口は別。将来の無関係アプリは VPS 上 PocketBase |
| 2026-08-25 | 初版。B の目的・A との境界・スキャフォールド方針を固定 |
