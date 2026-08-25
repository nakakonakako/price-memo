# 厳密単価比較（price-memo）— プロジェクト概要

> **このリポジトリは機能 B（厳密単価比較）である。**  
> レシート管理（機能 A）は隣リポジトリ `receipt-manager`。分離方針は [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md) を参照。

| 項目 | 内容 |
|------|------|
| リポジトリ名 | `price-memo` |
| プロダクト名（UI・仮） | 単価メモ / Price Memo |
| ドキュメント最終更新 | 2026-08-25 |
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

## 3. アーキテクチャ概要（方針）

A と同系統のスタックを想定する（認証・運用の揃えやすさのため）。最終的な DB 配置（A と同一 Supabase / 別プロジェクト）は実装フェーズで確定する。

```
Browser (React / Vite SPA)
  │  Supabase Auth（想定: Google OAuth。A と同一プロジェクトかは要検討）
  │  /api → Vite proxy（開発） / nginx（本番）
  ▼
FastAPI (uvicorn :8001 ※A は :8000)
  │  x-supabase-token → ユーザー単位の Supabase クライアント
  │  （店頭照会 OCR 等で Gemini を使う場合のみ GEMINI_API_KEY）
  ▼
Supabase（Auth + Postgres + RLS）
  └── 必要時: A 側テーブル（receipts / receipt_items）を読み取り参照
```

| 層 | パス | 役割 |
|----|------|------|
| フロントエンド | `frontend/` | SPA。機能は `src/features/` 以下 |
| バックエンド | `backend/app/` | FastAPI |
| DB・Auth | `supabase/` | マイグレーション（B 固有テーブル） |
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
| `folders` | フォルダ | スキャフォールド | 手動フォルダの一覧・作成・整理 |
| `records` | 記録 | スキャフォールド | 厳密レコードの登録・編集（確定データのみ） |
| `trends` | 値段推移 | スキャフォールド | フォルダ内の単価推移・店舗比較 |
| `inquiry` | 店頭照会 | 未着手 | 値札 OCR → B 内（必要なら A）と比較 |
| `link` | レシート紐付け | 未着手 | A 明細の検索・選択・紐付け |

### 4.2 機能モジュール（予定）

| 領域 | パス（予定） | ステータス | できること |
|------|--------------|------------|------------|
| フォルダ | `frontend/src/features/folders/` | スキャフォールド | 手動棚の CRUD |
| 厳密レコード | `frontend/src/features/records/` | スキャフォールド | 価格・単位量の確定記録 |
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

## 5. データモデル（草案）

B 固有テーブル（名称は実装時に確定）。RLS・`user_id` 分離を前提。

| テーブル（仮） | 概要 | 主なカラム（草案） | 備考 |
|----------------|------|-------------------|------|
| `folders` | 手動フォルダ | `name`, `user_id` | 比較したい集合の棚 |
| `price_records` | 厳密レコード | `folder_id`, `recorded_at`, `store_name`, `price`, `amount`, `unit`（g/個/ml 等）, `label_image_path?` | **確定データのみ** |
| `receipt_links`（またはレコード上の FK） | A 明細への紐付け | `price_record_id`, `receipt_item_id`（A） | A は知らない。B が ID を保持 |

A 参照（読み取りのみ・同一 DB の場合）:

| テーブル | 用途 |
|----------|------|
| `receipts` / `receipt_items` | 紐付け時の検索対象。B から更新しない |

マイグレーションは未作成。フェーズ 2 で追加する。

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
- DB: 未リンク。マイグレーション追加後に `npm run db:push` 等を用意

### 7.2 環境変数（予定）

**フロント**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**バック**

- `SUPABASE_URL` / `SUPABASE_KEY`（または VITE_ 互換）
- `GEMINI_API_KEY`（OCR 導入時）

`.env` は gitignore 対象。

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
| 2026-08-25 | 初版。B の目的・A との境界・スキャフォールド方針を固定 |
