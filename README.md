# 閱讀器

本機優先的 EPUB 閱讀器，針對中文排版最佳化。無後端、無帳號，書與筆記全部留在瀏覽器。

## 開始

```bash
npm install
npm run dev              # 開發伺服器
npm test                 # 單元測試
npm run build            # 產出 dist/
node scripts/verify.mjs  # 用真實瀏覽器走完整流程並產出截圖
```

把 `.epub` 放進 `public/books/`，首次開啟會自動匯入書櫃；平常直接把檔案拖進書櫃畫面即可。

## 功能

| 功能 | 說明 |
|---|---|
| 書櫃 | 多本書、封面網格、拖放匯入、閱讀進度徽章 |
| 分頁閱讀 | 固定畫面不捲動，點右側翻下一頁、左側回上一頁，手機可左右滑動；翻過章尾自動接下一章 |
| 閱讀設定 | 紙白／米黃／夜間主題，字體、字級、行高、字距、欄寬、兩端對齊 |
| 進度 | 以章內字元位移記錄，改字級也能回到同一句話；底部顯示百分比 |
| 劃線筆記 | 四色劃線、筆記、側欄管理、匯出 Markdown |
| 搜尋 | 全書子字串搜尋，附前後文，可跳轉並標示命中處 |
| 插圖處理 | 自動裁掉單色留白，白底線稿依主題融入背景 |
| 離線 | Service Worker 快取，可加到主畫面獨立開啟 |

按 `?` 查看鍵盤快捷鍵。

## 結構

| 路徑 | 用途 |
|---|---|
| `src/epub/` | EPUB 解析：zip → OPF → spine／目錄／章節 HTML |
| `src/reader/` | 章節渲染、圖片裁切、文字定位、搜尋、快捷鍵 |
| `src/ui/` | 書櫃、目錄、搜尋、設定、標註、說明面板 |
| `src/store/` | 書櫃（IndexedDB）與設定／進度／標註（localStorage） |
| `scripts/verify.mjs` | Playwright 端對端檢查與截圖 |

設計文件見 [docs/superpowers/specs](docs/superpowers/specs/)。
