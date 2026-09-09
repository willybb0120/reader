# EPUB 閱讀器 設計文件

日期：2026-09-09　狀態：已實作

## 目標

本機優先（local-first）的網頁 EPUB 閱讀器，針對中文排版最佳化。
無後端、無帳號，書籍與筆記全部留在瀏覽器。

## 技術選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| 框架 | Vite + React 19 + TypeScript | 啟動快、型別安全 |
| EPUB 解析 | 自寫 parser（fflate + DOMParser） | epub.js 對 CJK 分頁有已知問題，自寫可控 |
| 渲染 | 直接注入 DOM（非 iframe）+ 允許清單清理 | 可控樣式、可跨章搜尋與選取 |
| 分頁 | CSS 多欄（column-width 由 JS 給實際像素） | 不需自行計算文字斷點，交給瀏覽器排版 |
| 書櫃儲存 | IndexedDB（idb-keyval），檔案存 ArrayBuffer | 所有瀏覽器都支援，parseEpub 直接吃這型別 |
| 設定／進度／標註 | localStorage | 資料小且同步讀取，程式簡單 |
| 樣式 | 原生 CSS + CSS 變數 | 主題切換簡單，不需 UI 框架 |
| 測試 | Vitest（單元）＋ Playwright 腳本（端對端） | 邏輯採 TDD，畫面靠真實瀏覽器驗證 |

## 架構

```
src/
  epub/     解析層：zip → OPF → spine／目錄／章節 HTML + 資源 blob URL
  reader/   閱讀層：章節渲染、圖片裁切、文字定位、搜尋、快捷鍵、狀態 hooks
  store/    儲存層：書櫃、設定、進度、標註
  ui/       介面：書櫃、目錄、搜尋、設定、標註、說明
```

**資料流**：檔案 → `importEpub()` 存進書櫃 → `useBook(id)` 解析 →
`<ChapterView>` 注入 HTML 並套用標註 → 互動 → store → 瀏覽器儲存。

## 關鍵決策

- **標註定位用「章節純文字的字元位移」**：字級、行高、欄寬改變都不影響，
  只要書本內容不變就永遠對得上。`getChapterText` 取自渲染後的 HTML，
  確保搜尋與標註共用同一套座標。閱讀進度也用同一套座標，
  所以改字級後回到的是同一句話，而不是同一個頁碼。
- **閱讀是分頁而非捲動**：畫面固定，點右側 2/3 翻下一頁、左側 1/3 回上一頁，
  手機可左右滑動。翻過章尾自動接下一章第一頁，往回則接上一章最後一頁，
  讀者感覺不到章節邊界。
- **column-width 必須用實際像素**：CSS 的 `column-width` 不接受百分比，
  分欄尺寸只能在量到視窗大小後由 JS 寫進行內樣式。
- **換章的動畫方向要另外指定**：換章時頁碼歸零或跳到章尾，位移量與翻頁方向無關，
  單靠 transform 差值動畫會往反方向滑。做法是先把新章擺在相鄰的一頁外
  （`enterOffset`），下一幀才滑到定位。目錄、搜尋等跳轉不帶方向，直接定位。
- **插圖自動裁掉單色留白**：電子書的章節裝飾圖常帶整頁留白，
  在捲動版面會撐出空洞。裁切在注入畫面前完成，重繪不會退回原圖。
- **白底線稿另外處理**：亮色主題用 multiply 融入紙色，暗色主題反相後用 lighten。
- **章節 HTML 由自寫的允許清單清理**，不引入 DOMPurify——內容來源固定，需求單純。

## 功能與分支

| 分支 | 內容 |
|---|---|
| `feat/core-reader` | EPUB parser、章節渲染、目錄導覽 |
| `feat/reading-ux` | 主題、字體、字級、行高、字距、欄寬、對齊 |
| `feat/image-trim` | 插圖留白自動裁切、線稿融入主題 |
| `feat/progress` | 進度記錄與還原、進度條、剩餘時間 |
| `feat/annotations` | 劃線、筆記、側欄管理、Markdown 匯出 |
| `feat/search` | 全書搜尋與結果跳轉 |
| `feat/library` | 多書書櫃、拖放匯入、封面網格 |
| `feat/keyboard` | 快捷鍵與說明面板 |
| `feat/mobile-polish` | 窄螢幕版面、鍵盤焦點樣式 |
| `feat/offline` | Service Worker 離線快取、可安裝 |
| `feat/paginated-reading` | 分頁閱讀、點擊／滑動翻頁、跨章連續、移除捲動 |
| `feat/cross-chapter-slide` | 跨章翻頁也有正確方向的滑動動畫 |

## 錯誤處理

- 解析失敗 → 顯示具體階段錯誤（缺 container.xml / OPF / spine 為空）
- 缺少資源（圖片）→ 移除該圖，章節照常渲染
- 圖片裁切失敗 → 顯示原圖
- localStorage 不可用 → 忽略寫入，資料僅在本次工作階段有效

## 非目標

雲端同步、帳號、DRM、PDF/MOBI、朗讀、翻譯、直排、捲動閱讀模式。

## 測試策略

- `src/epub`、`src/store`、`src/reader` 的純邏輯採 TDD，共 95 個單元測試
- 分頁的版面量測（`pageMetrics.ts`）依賴真實排版，jsdom 量不到，只由 verify.mjs 驗證
- `src/epub/realBook.test.ts` 以 `public/books` 的真實 EPUB 驗證解析
- `scripts/verify.mjs` 以 Playwright 走完整流程並產出截圖，同時檢查 console 無錯誤
