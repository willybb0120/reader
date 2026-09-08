# EPUB 閱讀器 設計文件

日期：2026-09-09　狀態：已核准（使用者授權自主決策）

## 目標

本機優先（local-first）的網頁 EPUB 閱讀器，針對中文直排/橫排排版最佳化，
第一本書為《創造力的修行》。無後端、無帳號、資料全存瀏覽器。

## 技術選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| 框架 | Vite + React 19 + TypeScript | 啟動快、型別安全、生態成熟 |
| EPUB 解析 | 自寫 parser（fflate + DOMParser） | epub.js 對 CJK 分頁有已知問題，自寫可控 |
| 渲染 | 直接注入 DOM（非 iframe）+ DOMPurify | 可控樣式、可跨章搜尋與選取 |
| 儲存 | IndexedDB（idb-keyval） | 存書檔 blob 與閱讀狀態 |
| 樣式 | 原生 CSS + CSS 變數 | 主題切換簡單，不需 UI 框架 |
| 測試 | Vitest | parser 與定位邏輯採 TDD |

## 架構

```
src/
  epub/        解析層：zip → OPF → spine/manifest/nav → 章節 HTML + 資源 blob URL
  store/       狀態層：書庫、閱讀設定、進度、書籤、劃線（IndexedDB 持久化）
  reader/      渲染層：章節渲染、捲動/分頁、選取工具列
  ui/          介面：書庫、目錄、設定面板、搜尋面板
```

**資料流**：檔案 → `parseEpub()` → `Book` 物件 → `<Reader>` 渲染單章 →
使用者互動 → store → IndexedDB。

## 核心型別

- `Book`：metadata、spine（章節順序）、nav（目錄樹）、`getChapter(id)`
- `Locator`：`{ chapterIndex, charOffset }` — 跨字級變動仍穩定的定位單位
- `Annotation`：`{ id, bookId, locator, endOffset, text, note?, color }`

## 功能與分支規劃

| 分支 | 內容 |
|---|---|
| `feat/core-reader` | 專案骨架、EPUB parser、章節渲染、目錄導覽 |
| `feat/reading-ux` | 字級/行高/字距/邊界、字體、亮/暗/米色主題、直排模式 |
| `feat/progress` | 閱讀進度記錄與還原、進度條、上下章導覽 |
| `feat/annotations` | 劃線、筆記、書籤、側欄管理與匯出 |
| `feat/search` | 全書全文搜尋、結果跳轉與高亮 |
| `feat/library` | 多書書庫、拖放匯入、封面網格 |
| `feat/keyboard` | 鍵盤快捷鍵與說明面板 |

## 錯誤處理

- 解析失敗 → 顯示具體階段錯誤（缺 container.xml / OPF / spine 為空），不白畫面
- 缺少資源（圖片/CSS）→ 略過該資源，章節照常渲染
- IndexedDB 不可用 → 降級為 in-memory，警示不會保存

## 非目標（YAGNI）

雲端同步、帳號、DRM、PDF/MOBI 支援、朗讀、翻譯。

## 測試策略

- parser：以真實 EPUB 為 fixture，驗證 metadata / spine 長度 / 目錄 / 章節 HTML
- locator：字元位移 ↔ DOM Range 雙向轉換
- store：進度與註記的存取
- UI：不寫單元測試，以手動與建置檢查為主
