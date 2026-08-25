# price-memo（機能 B: 厳密単価比較）

ユーザーが意図して選んだ商品だけを、確定した重量・個数・容量で記録し、単価で比較するアプリ。

- **本リポジトリ = 機能 B**（手動フォルダ・厳密レコード・値段推移・店頭照会）
- **機能 A**（レシート管理・AI カテゴリ）は隣の [`receipt-manager`](../receipt-manager)
- 分離方針: [docs/spec-split-receipt-and-unit-price.md](./docs/spec-split-receipt-and-unit-price.md)
- 概要: [docs/project-overview.md](./docs/project-overview.md)

## やること / やらないこと

| やる | やらない |
|------|----------|
| 手動フォルダで比較対象を棚分け | AI 自動カテゴリ |
| 確定データのみの厳密単価 | 仮定パック重量 |
| A レシート DB の一方向参照・紐付け | A の登録 UI への埋め込み |
| 値段推移・店頭照会 | ざっくり総額比較の復活 |

## 開発（スキャフォールド）

```bash
npm install
cd frontend && npm install && cd ..
cd backend && uv sync && cd ..
npm run dev
```

- FRONT: Vite (`frontend/`)
- BACK: uvicorn (`backend/` → `:8001`、A の 8000 と併走可）、`/api` は Vite がプロキシ

環境変数や DB は未接続。詳細は [docs/project-overview.md](./docs/project-overview.md)。
