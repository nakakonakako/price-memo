# 厳密単価比較（price-memo）— プロジェクト概要

> **このリポジトリは機能 B（厳密単価比較）である。**  
> レシート管理（機能 A）は隣リポジトリ `receipt-manager`。分離方針は [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md) を参照。

| 項目 | 内容 |
|------|------|
| リポジトリ名 | `price-memo` |
| プロダクト名（UI・仮） | 単価メモ / Price Memo |
| ドキュメント最終更新 | 2026-08-26 |
| 文書の扱い | **生きた概要**。機能の追加・削除・方針変更のたびに本ファイルを更新する |

---

## この文書の更新ルール

機能や環境が変わったら、最低限次を直す。

1. **§4 機能一覧** … 追加 / 削除 / ステータス変更
2. **§5 データモデル** … テーブル・主要カラムの増減
3. **§6 技術スタック / §7 環境** … 依存や起動手順の変化
4. **§10 変更履歴** … 日付と一行要約を追記

詳細な設計判断は別 md（`docs/spec-*.md` など）に切り出し、ここからはリンクする。

---

## 1. 目的

**ユーザーが意図して選んだ商品だけを、確定した重量・個数・容量で厳密に記録し、単価で比較する。**

- 主用途は手動フォルダに入れた商品の単価推移・店舗比較
- 店頭での値札照会（将来）
- 必要時のみ A のレシート明細を参照して紐付け
- 「家計の支出記録」や「AI による自動カテゴリ」は **目的に含めない**（→ 機能 A）

---

## 2. スコープ（A / B）

| | 機能 A（`receipt-manager`） | 本プロジェクト（B） |
|--|-----------------------------|---------------------|
| 目的 | 支出の記録・検索・管理 | 意図した商品だけの厳密単価比較 |
| カテゴリ | AI / 学習の `main` / `sub` | **手動フォルダのみ** |
| 単価・重量 | 扱わない | g / 個 / ml 等の **確定データのみ** |
| 値段推移・店頭照会 | 置かない（削除済み） | **本側で実装** |
| 連携 | B を知らない | A のレシート DB を **一方向参照** |

詳細: [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md)

---

## 3. アーキテクチャ概要（方針・確定）

### 3.1 DB / Auth 配置

| 決定 | 内容 |
|------|------|
| A と B | **同一 Supabase プロジェクト**（既存の Dev / Prod 各1）。B 用テーブルを足す |
| マイグレーション | B 固有は本リポジトリ `supabase/migrations/`。Supabase CLI で A と同じ Dev/Prod へ `db push` |
| Auth | **共有**（同じ `auth.users` / 同じ Google OAuth）。アプリ入り口（URL・SPA）は分けるが、アカウントは分けない |
| 将来の無関係アプリ | Supabase 枠は増やさない。VPS 上の **PocketBase** などで別運営 |

**入り口が別 ≠ ユーザー DB が別。** 同じ人が A と B にログインすると同じ `user_id` になる。レシート紐付け（一方向参照）に必要で、個人利用でも自然。

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
  │  /api → Vite proxy（開発） / nginx（本番）
  ▼
FastAPI (uvicorn :8001 ※A は :8000)
  │  x-supabase-token → ユーザー単位の Supabase クライアント
  │  （店頭照会 OCR 等で Gemini を使う場合のみ GEMINI_API_KEY）
  ▼
Supabase（A の Dev または Prod）
  ├── A テーブル（receipts 等）… B は参照のみ
  └── B テーブル（folders 等）… 本リポの migration で追加
```

| 層 | パス | 役割 |
|----|------|------|
| フロントエンド | `frontend/` | SPA。機能は `src/features/` 以下 |
| バックエンド | `backend/app/` | FastAPI |
| DB・Auth | `supabase/` | B 固有マイグレーション（リンク先は A と同一） |
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
| `folders` | フォルダ | **現行** | 手動フォルダの一覧・作成・改名・削除（Supabase RLS 直） |
| `records` | 記録 | **現行** | 厳密レコードの登録・編集・削除（確定データのみ・単価プレビュー） |
| `trends` | 値段推移 | スキャフォールド | フォルダ内の単価推移・店舗比較 |
| `inquiry` | 店頭照会 | 未着手 | 値札 OCR → B 内（必要なら A）と比較 |
| `link` | レシート紐付け | 未着手 | A 明細の検索・選択・紐付け |

### 4.2 機能モジュール（予定）

| 領域 | パス（予定） | ステータス | できること |
|------|--------------|------------|------------|
| フォルダ | `frontend/src/features/folders/` | **現行** | 手動棚の CRUD（`price_folders`） |
| 厳密レコード | `frontend/src/features/records/` | **現行** | 価格・単位量の確定記録（`price_records`） |
| 値段推移 | `frontend/src/features/trends/` | スキャフォールド | グラフ・店舗比較 |
| 店頭照会 | `frontend/src/features/inquiry/` | 未着手 | 値札 OCR |
| A 参照 | `frontend/src/features/receipt-link/` | 未着手 | A 明細検索・紐付け |

### 4.3 バックエンド API

スキャフォールド時点ではヘルスチェックのみ。フォルダ / レコード / 紐付け / OCR はフェーズ 2 以降。

| Method | Path | 認証 | 用途 | ステータス |
|--------|------|------|------|------------|
| GET | `/` | 不要 | ヘルスチェック | スキャフォールド |

### 4.4 カテゴリ（B）

- **手動フォルダのみ**。AI 自動カテゴリは作らない・持ち込まない。
- A の `main_category` / `sub_category` は紐付け検索の手がかりには使えるが、B の棚にはしない。

---

## 5. データモデル

B 固有テーブル。RLS・`user_id` 分離。マイグレーション: `supabase/migrations/20260826100000_price_folders_and_records.sql`

| テーブル | 概要 | 主なカラム | 備考 |
|----------|------|------------|------|
| `price_folders` | 手動フォルダ | `name`, `user_id`（同一ユーザー内で `name` 一意） | 比較したい集合の棚 |
| `price_records` | 厳密レコード | `folder_id`, `recorded_at`, `store_name`, `price`, `amount`, `unit`（`g` / `ml` / `piece`）, `receipt_item_id?`, `label_image_path?` | **確定データのみ**。記録タブで CRUD 可 |

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
| Recharts | 値段推移用（導入予定） |

### バックエンド

| 技術 | 目安 |
|------|------|
| Python | >=3.10（実行は 3.12 想定） |
| FastAPI / Uvicorn | A と同系 |
| supabase (Python) | A と同系 |
| google-genai | 店頭照会 OCR 導入時 |
| uv / Ruff | パッケージ・lint |

---

## 7. 環境・起動

### 7.1 ローカル開発

```bash
npm install
cd frontend && npm install
cd ../backend && uv sync
cd .. && npm run dev
```

- Vite が `/api` を `http://localhost:8001` へプロキシ（A の 8000 と併走可能）
- DB: A と同じ Supabase プロジェクトへ link し、B 用 migration を `npm run db:push`

### 7.2 環境変数（予定）

**フロント**（A の Dev/Prod と同じ値でよい）

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**バック**

- `SUPABASE_URL` / `SUPABASE_KEY`（または VITE_ 互換）
- `GEMINI_API_KEY`（OCR 導入時）

`.env` は gitignore 対象。OAuth のリダイレクト URL は A / B それぞれのオリジンを Supabase ダッシュボードに追加する。

---

## 8. ディレクトリガイド

```
price-memo/
├── frontend/          # React SPA
│   └── src/
│       ├── components/
│       ├── features/      # folders, records, trends, …
│       ├── contexts/
│       └── lib/
├── backend/
│   └── app/
│       ├── main.py
│       ├── schemas/
│       └── services/
├── supabase/migrations/   # 未作成（プレースホルダ）
├── docs/
└── package.json           # concurrently で FE+BE
```

---

## 9. 関連ドキュメント

| 文書 | 内容 |
|------|------|
| [README.md](./README.md) | docs 索引 |
| [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md) | A/B 分離方針 |
| `../receipt-manager/docs/project-overview.md` | A の生きた概要（隣リポジトリ） |

---

## 10. 変更履歴（このドキュメント）

| 日付 | 内容 |
|------|------|
| 2026-08-26 | 厳密レコード（`price_records`）登録・編集・削除 UI |
| 2026-08-26 | `price_folders` / `price_records` migration 追加。フォルダ CRUD（Auth 共有・RLS 直） |
| 2026-08-26 | DB は A と同一 Supabase（CLI）。Auth 共有・入り口は別。将来の無関係アプリは VPS 上 PocketBase |
| 2026-08-25 | 初版。B の目的・A との境界・スキャフォールド方針を固定 |
