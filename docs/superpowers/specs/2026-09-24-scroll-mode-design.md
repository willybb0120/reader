# 直式滾動模式設計

在既有的橫向分頁之外，加一個可切換的直式滾動閱讀模式。受眾以手機為主。

## 範圍

- 單章滾動：一次只載入一章，滾到章尾再滾一下才換章。
- 不做全書連續滾動（需要虛擬滾動與章節回收，成本遠高於收益）。
- 預設仍是分頁模式，分頁行為完全不變。

## 設定

| 項目 | 內容 |
|---|---|
| 欄位 | `Settings.scroll: boolean`，預設 `false` |
| 正規化 | `src/store/settings.ts` 的 `normalize` 比照 `justify` |
| UI | `SettingsPanel` 加「直式滾動」開關，沿用 `justify` 的 toggle 樣式 |

## 架構

拆成兩個版面元件，共用與版面無關的內容處理。

| 檔案 | 職責 |
|---|---|
| `src/reader/chapterTypes.ts` | 新增。`Entry` / `PagerApi` / `TextSelection` / `ChapterViewProps` 移入，避免父子元件互相 import |
| `src/reader/useChapterContent.ts` | 新增。寫入 `innerHTML` + 標註、朗讀高亮、選字回報、連結與標註點擊 |
| `src/reader/PagedChapter.tsx` | 現有 `ChapterView` 減去共用部分，行為不變 |
| `src/reader/ScrollChapter.tsx` | 新增。滾動模式 |
| `src/reader/ChapterView.tsx` | 只剩依 `scroll` prop 選元件；`App.tsx` 傳入 `settings.scroll` |

現有的點擊 handler 把「連結 / 標註 / 翻頁」混在一起，抽共用時要拆開：前兩者進 `useChapterContent`，翻頁留在 `PagedChapter`。

## 滾動模式行為

- **版面**：viewport `overflow-y: auto`，內容單欄，不呼叫 `applyLayout`。
- **位置換算**：`pageMetrics.ts` 加 `charOffsetAtScrollTop` 與 `scrollTopForCharOffset`，比照現有二分搜尋，改量 `rect.top`。以視窗頂端的字元位移代表目前位置。
- **entry**：`offset` / `fragment` / `annotation` 捲到該元素；`first` 捲到頂端；`last` 捲到底部。
- **換章**：`slide` 忽略，不做滑入動畫，直接回到頂端。
- **章尾銜接**：到底後再一次向下滾動才觸發 `onPastEnd`；頂端同理 `onPastStart`。觸發後 600ms 內不再判定，避免慣性滾動連續換章。
- **朗讀 reveal**：句子不在可視範圍才 smooth 捲動，落點在畫面上方 1/3。
- **`PagerApi.turn(delta)`**：捲一個視窗高；到頂 / 到底改呼叫 `onPastStart` / `onPastEnd`。鍵盤 ←/→/Space 沿用。
- **點擊翻頁與左右滑**：滾動模式不啟用，交給原生滾動。
- **進度回報**：scroll 事件以 rAF 節流後呼叫 `onPositionChange`。進度計算（charOffset / chapterLength）不變。

## 測試

- 位置換算的純函式 → vitest。
- 真實排版行為 jsdom 量不到 → `scripts/verify.mjs` 補滾動模式案例：進入模式後的定位、章尾換章、朗讀捲動。
