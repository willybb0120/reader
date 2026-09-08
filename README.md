# 閱讀器

本機優先的 EPUB 閱讀器，針對中文排版最佳化。無後端、無帳號，資料留在瀏覽器。

## 開始

```bash
npm install
npm run dev        # 開發伺服器
npm test           # 單元測試
npm run build      # 產出 dist/
node scripts/verify.mjs   # 用真實瀏覽器驗證並產出截圖
```

把 `.epub` 放進 `public/books/`，開啟頁面即自動載入第一本；也可在畫面上手動選檔。

## 結構

| 路徑 | 用途 |
|---|---|
| `src/epub/` | EPUB 解析：zip → OPF → spine／目錄／章節 HTML |
| `src/reader/` | 章節渲染與閱讀互動 |
| `src/ui/` | 目錄、設定等介面元件 |
| `src/store/` | 閱讀狀態與 IndexedDB 持久化 |
| `scripts/verify.mjs` | Playwright 端對端檢查與截圖 |

設計文件見 [docs/superpowers/specs](docs/superpowers/specs/)。
