# docs

プロダクト仕様・設計メモ。**本リポジトリは機能 B（厳密単価比較／単価統計）**。

機能追加・削除や方針変更があったら、まず [project-overview.md](./project-overview.md) を更新する。詳細設計は `spec-*.md` 等に切り出す。

機能 A（レシート管理）との分離方針の原本は隣リポジトリ `receipt-manager` の docs にある。本リポジトリにも写しを置き、B 視点の補足を足している。

| 文書 | 内容 |
|------|------|
| [project-overview.md](./project-overview.md) | **プロジェクト概要（生きたドキュメント）** — 目的・機能・環境・スタック |
| [spec-split-receipt-and-unit-price.md](./spec-split-receipt-and-unit-price.md) | レシート管理（A）と厳密単価比較（B）の分離方針 |
| [spec-shopping-memo.md](./spec-shopping-memo.md) | **買い物メモ** — 店頭の主フロー（統計＋試算）。OCR 店頭照会は非本流 |
