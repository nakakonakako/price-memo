# price-memo（機能 B: 厳密単価比較／単価統計）

意図した商品だけを、確定した重量・個数・容量で記録し、単価で比較するアプリ。支出管理ではない。

- **本リポジトリ = 機能 B**（手動フォルダ・厳密レコード・値段推移・買い物メモ）
- **機能 A**（レシート管理・AI カテゴリ）は隣の [`receipt-manager`](../receipt-manager)
- 分離方針: [docs/spec-split-receipt-and-unit-price.md](./docs/spec-split-receipt-and-unit-price.md)
- 買い物メモ: [docs/spec-shopping-memo.md](./docs/spec-shopping-memo.md)
- フォルダタブ: [docs/spec-folders-catalog.md](./docs/spec-folders-catalog.md)
- 概要: [docs/project-overview.md](./docs/project-overview.md)

## やること / やらないこと

| やる | やらない |
|------|----------|
| 手動フォルダで比較対象を棚分け（品目名・店名カタログ） | AI 自動カテゴリ |
| 確定データのみの厳密単価 | 仮定パック重量 |
| 買い物メモ（ピン留めリスト＋統計＋店頭試算） | 全フォルダの自動ミラー |
| 店舗名カタログ（`StoreField`） | 値札 OCR を本流にすること |
| A の任意参照・下書き | A 必須／A 待ちの未完成レコード |
| 値段推移・店舗比較（PC はフォルダ内パネル、スマホはタブ） | ざっくり総額比較の復活 |

## 開発

```bash
npm install
cd frontend && npm install && cd ..
cd backend && uv sync && cd ..
npm run dev
```

- FRONT: Vite (`frontend/`)
- BACK: uvicorn (`backend/` → `:8001`、A の 8000 と併走可）、`/api` は Vite がプロキシ

詳細は [docs/project-overview.md](./docs/project-overview.md)。
