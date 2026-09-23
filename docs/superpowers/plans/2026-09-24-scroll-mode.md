# 直式滾動模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有橫向分頁之外，加一個可在設定中切換的直式滾動閱讀模式（單章滾動）。

**Architecture:** 把 `ChapterView` 拆成 `PagedChapter`（現有行為原封不動）與 `ScrollChapter`（新增），版面無關的部分抽成 `useChapterContent`；`ChapterView` 只負責依 `settings.scroll` 分派。滾動模式的邊界與捲動目標計算抽成純函式模組 `scroll.ts` 以便單元測試，需要真實排版的 DOM 量測放在 `pageMetrics.ts`，由 `scripts/verify.mjs` 在真實瀏覽器驗證。

**Tech Stack:** React 19 + TypeScript + Vite；測試用 vitest（jsdom）；端對端驗證用 playwright（`scripts/verify.mjs`）。

**Spec:** `docs/superpowers/specs/2026-09-24-scroll-mode-design.md`

## Global Constraints

- 預設維持分頁模式（`Settings.scroll` 預設 `false`）；分頁模式的行為、DOM 結構、動畫一律不得改變。
- 註解與 UI 文字一律繁體中文。
- 位置單位固定是「章節純文字的字元位移」（`plainText` 的 index），不得引入第二套定位單位。
- jsdom 量不到真實排版：任何依賴 `getBoundingClientRect` 的程式碼不寫 vitest，改在 `scripts/verify.mjs` 驗。
- 每個 task 結束前必須通過 `npx tsc -b` 與 `npm test`。
- 章尾／章首換章的冷卻時間固定 600ms。

---

### Task 1: 設定加入「直式滾動」

**Files:**
- Modify: `src/store/settings.ts`
- Modify: `src/ui/SettingsPanel.tsx:142-149`
- Test: `src/store/settings.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `Settings.scroll: boolean`（預設 `false`），供後續 task 從 `useSettings()` 讀取。

- [ ] **Step 1: 寫失敗的測試**

在 `src/store/settings.test.ts` 的 `describe('閱讀設定', ...)` 內新增：

```ts
  test('預設是分頁模式', () => {
    expect(loadSettings().scroll).toBe(false)
  })

  test('記住直式滾動的選擇', () => {
    saveSettings({ ...DEFAULT_SETTINGS, scroll: true })

    expect(loadSettings().scroll).toBe(true)
  })

  test('scroll 不是布林值時退回預設', () => {
    localStorage.setItem('reader:settings', JSON.stringify({ scroll: '是' }))

    expect(loadSettings().scroll).toBe(false)
  })
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/store/settings.test.ts`
Expected: FAIL，`expect(undefined).toBe(false)`

- [ ] **Step 3: 加上欄位**

`src/store/settings.ts`，在 `Settings` 介面的 `justify` 之後加：

```ts
  /** 直式滾動閱讀，false 為橫向分頁 */
  scroll: boolean
```

`DEFAULT_SETTINGS` 的 `justify: true,` 之後加：

```ts
  scroll: false,
```

`normalize` 的 `justify` 那行之後加：

```ts
    scroll: typeof input.scroll === 'boolean' ? input.scroll : DEFAULT_SETTINGS.scroll,
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run src/store/settings.test.ts`
Expected: PASS

- [ ] **Step 5: 加上設定面板開關**

`src/ui/SettingsPanel.tsx`，在「兩端對齊」那個 `<label>` 之後插入：

```tsx
          <label className="setting setting--row">
            <span className="setting__label">直式滾動</span>
            <input
              type="checkbox"
              checked={settings.scroll}
              onChange={(event) => onChange({ scroll: event.target.checked })}
            />
          </label>
```

- [ ] **Step 6: 型別檢查與全部測試**

Run: `npx tsc -b && npm test`
Expected: 都通過

- [ ] **Step 7: Commit**

```bash
git add src/store/settings.ts src/store/settings.test.ts src/ui/SettingsPanel.tsx
git commit -m "feat: 設定加入直式滾動開關"
```

---

### Task 2: 抽出共用型別

純重構，不改任何行為。目的是讓 `ChapterView` 與兩個子元件不互相 import。

**Files:**
- Create: `src/reader/chapterTypes.ts`
- Modify: `src/reader/ChapterView.tsx`
- Modify: `src/reader/useBook.ts:3`
- Modify: `src/App.tsx:2`

**Interfaces:**
- Consumes: Task 1 的 `Settings.scroll`（尚未使用）
- Produces: `src/reader/chapterTypes.ts` 匯出 `TextSelection`、`EntryTarget`、`Entry`、`PagerApi`、`ChapterViewProps`。

- [ ] **Step 1: 建立型別檔**

把 `src/reader/ChapterView.tsx` 最上方的 `TextSelection`、`EntryTarget`、`Entry`、`PagerApi`、`ChapterViewProps` 五個宣告整段剪下，貼進新檔 `src/reader/chapterTypes.ts`，並在檔頭補上需要的 import：

```ts
import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'
```

註解一併搬過去，內容一字不改。

- [ ] **Step 2: 讓 ChapterView 改用型別檔**

`src/reader/ChapterView.tsx` 檔頭刪掉 `import type { Chapter }`、`import type { Annotation }`，改加：

```ts
import type { ChapterViewProps, Entry, PagerApi, TextSelection } from './chapterTypes'
```

`PagerApi` 與 `TextSelection` 在本檔沒用到就不要 import（`npx tsc -b` 會抓出來）。

- [ ] **Step 3: 更新其他引用點**

`src/reader/useBook.ts` 第 3 行改成：

```ts
import type { Entry } from './chapterTypes'
```

`src/App.tsx` 第 2 行拆成兩行：

```ts
import { ChapterView } from './reader/ChapterView'
import type { Entry, PagerApi, TextSelection } from './reader/chapterTypes'
```

- [ ] **Step 4: 驗證沒有行為改變**

Run: `npx tsc -b && npm test`
Expected: 都通過（這步只搬型別，測試結果應與 Task 1 結束時完全相同）

- [ ] **Step 5: Commit**

```bash
git add src/reader/chapterTypes.ts src/reader/ChapterView.tsx src/reader/useBook.ts src/App.tsx
git commit -m "refactor: 章節元件型別抽成 chapterTypes"
```

---

### Task 3: 抽出 useChapterContent 與 PagedChapter

純重構，分頁行為必須完全不變。

**Files:**
- Create: `src/reader/useChapterContent.ts`
- Create: `src/reader/PagedChapter.tsx`
- Modify: `src/reader/ChapterView.tsx`

**Interfaces:**
- Consumes: `./chapterTypes` 的 `ChapterViewProps`、`Entry`
- Produces:
  - `useChapterContent(options: ChapterContentOptions): void`，`ChapterContentOptions = { contentRef: React.RefObject<HTMLElement | null>; chapter: Chapter; annotations: Annotation[]; highlightRange?: { start: number; end: number }; speakingRange?: { start: number; end: number }; onSelect: (s: TextSelection | null) => void; onNavigate: (chapterIndex: number, fragment?: string) => void; onAnnotationClick: (id: string, rect: DOMRect) => void }`
  - `PagedChapter(props: ChapterViewProps)`：現有分頁元件。

- [ ] **Step 1: 建立共用 hook**

新檔 `src/reader/useChapterContent.ts`：

```ts
import { useEffect, useLayoutEffect } from 'react'
import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'
import type { TextSelection } from './chapterTypes'
import { getTextOffsets, wrapRange } from './textRange'

export interface ChapterContentOptions {
  contentRef: React.RefObject<HTMLElement | null>
  chapter: Chapter
  annotations: Annotation[]
  highlightRange?: { start: number; end: number }
  speakingRange?: { start: number; end: number }
  onSelect: (selection: TextSelection | null) => void
  onNavigate: (chapterIndex: number, fragment?: string) => void
  onAnnotationClick: (id: string, rect: DOMRect) => void
}

/**
 * 章節內容本身的處理：寫入 HTML、包標註、朗讀高亮、選字與內部連結。
 * 這些和版面（分頁或滾動）無關，兩種模式共用。
 */
export function useChapterContent({
  contentRef,
  chapter,
  annotations,
  highlightRange,
  speakingRange,
  onSelect,
  onNavigate,
  onAnnotationClick,
}: ChapterContentOptions): void {
  // 內容與標註直接寫進 DOM：標註是包在文字上的 <mark>，交給 React 管理反而更複雜
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    content.innerHTML = chapter.html
    for (const annotation of annotations) {
      wrapRange(content, annotation.start, annotation.end, {
        annotation: annotation.id,
        color: annotation.color,
      })
    }
    if (highlightRange) {
      wrapRange(content, highlightRange.start, highlightRange.end, { searchHit: 'true' })
    }
  }, [contentRef, chapter.html, annotations, highlightRange])

  // 朗讀高亮單獨處理：重設 innerHTML 會觸發重新排版，每念一句都重排太浪費
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    for (const mark of content.querySelectorAll('mark[data-speaking]')) {
      const parent = mark.parentNode
      if (!parent) continue
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      mark.remove()
      parent.normalize()
    }
    if (speakingRange) {
      wrapRange(content, speakingRange.start, speakingRange.end, { speaking: 'true' })
    }
  }, [contentRef, speakingRange, chapter.html, annotations, highlightRange])

  // 內部連結與標註的點擊。翻頁的點擊由分頁元件自己處理。
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      const anchor = target.closest('a[data-chapter]')
      if (anchor) {
        event.preventDefault()
        event.stopPropagation()
        onNavigate(
          Number(anchor.getAttribute('data-chapter')),
          anchor.getAttribute('data-fragment') ?? undefined,
        )
        return
      }

      const mark = target.closest<HTMLElement>('mark[data-annotation]')
      if (mark) {
        event.stopPropagation()
        onAnnotationClick(mark.dataset.annotation!, mark.getBoundingClientRect())
      }
    }

    content.addEventListener('click', onClick)
    return () => content.removeEventListener('click', onClick)
  }, [contentRef, onNavigate, onAnnotationClick])

  // 選取文字後浮出標註工具列
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const onSelectionEnd = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        onSelect(null)
        return
      }
      const range = selection.getRangeAt(0)
      const text = range.toString().trim()
      if (!content.contains(range.commonAncestorContainer) || !text) {
        onSelect(null)
        return
      }
      const { start, end } = getTextOffsets(content, range)
      onSelect({ start, end, text, rect: range.getBoundingClientRect() })
    }

    document.addEventListener('mouseup', onSelectionEnd)
    document.addEventListener('touchend', onSelectionEnd)
    return () => {
      document.removeEventListener('mouseup', onSelectionEnd)
      document.removeEventListener('touchend', onSelectionEnd)
    }
  }, [contentRef, onSelect])
}
```

**關鍵差異**：連結與標註的點擊改綁在 `content` 上、並 `stopPropagation()`，翻頁的點擊仍綁在 `viewport` 上。因為 `content` 是 `viewport` 的子節點，內層先處理、擋住外層，行為與原本的單一 handler 相同。

- [ ] **Step 2: 建立 PagedChapter**

`git mv src/reader/ChapterView.tsx src/reader/PagedChapter.tsx`，然後在 `PagedChapter.tsx` 裡：

1. 匯出的函式從 `export function ChapterView(` 改名為 `export function PagedChapter(`，參數型別改成 `ChapterViewProps`。
2. 刪掉三段已搬進 hook 的 effect：註解為「內容與標註直接寫進 DOM」、「朗讀高亮單獨處理」、「選取文字後浮出標註工具列」的那三個。
3. 「點擊翻頁」那個 effect 只保留翻頁部分，刪掉 `anchor` 與 `mark` 兩個分支，變成：

```tsx
  // 點擊翻頁：右側 2/3 往下、左側 1/3 往回
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const onClick = (event: MouseEvent) => {
      // 正在選字時不翻頁，否則想劃線就會跳頁
      if (!window.getSelection()?.isCollapsed) return

      const { left, width } = viewport.getBoundingClientRect()
      turn(event.clientX - left < width / 3 ? -1 : 1)
    }

    viewport.addEventListener('click', onClick)
    return () => viewport.removeEventListener('click', onClick)
  }, [turn])
```

4. 在元件開頭（`const [layout, setLayout] = ...` 之前）呼叫 hook：

```tsx
  useChapterContent({
    contentRef,
    chapter,
    annotations,
    highlightRange,
    speakingRange,
    onSelect,
    onNavigate,
    onAnnotationClick,
  })
```

5. 檔頭 import 改為：

```tsx
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { plainText } from './textRange'
import { pageCount, translateForPage, type PageLayout } from './pagination'
import { applyLayout, charOffsetAtPage, pageForCharOffset, readLayout } from './pageMetrics'
import { useChapterContent } from './useChapterContent'
```

6. 檔案最後保留 `export function PagedChapter`，不要再匯出型別。

- [ ] **Step 3: 新的 ChapterView 只負責分派**

新檔 `src/reader/ChapterView.tsx`：

```tsx
import type { ChapterViewProps } from './chapterTypes'
import { PagedChapter } from './PagedChapter'

/** 依設定選擇版面：橫向分頁或直式滾動。 */
export function ChapterView(props: ChapterViewProps & { scroll: boolean }) {
  const { scroll, ...rest } = props
  // ScrollChapter 在 Task 5 接上，先一律走分頁
  void scroll
  return <PagedChapter {...rest} />
}
```

- [ ] **Step 4: App 傳入 scroll**

`src/App.tsx` 的 `<ChapterView` 加一個 prop：

```tsx
            scroll={settings.scroll}
```

- [ ] **Step 5: 型別檢查與測試**

Run: `npx tsc -b && npm test`
Expected: 都通過

- [ ] **Step 6: 用真實瀏覽器確認分頁行為沒變**

Run: `npm run build && node scripts/verify.mjs`
Expected: `✓ 分頁閱讀正常`，且沒有 console 錯誤

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: 章節內容處理抽成 useChapterContent，分頁改為 PagedChapter"
```

---

### Task 4: 滾動模式的純函式

**Files:**
- Create: `src/reader/scroll.ts`
- Test: `src/reader/scroll.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `atStart(scrollTop: number): boolean`
  - `atEnd(scrollTop: number, clientHeight: number, scrollHeight: number): boolean`
  - `clampScrollTop(top: number, clientHeight: number, scrollHeight: number): number`
  - `turnScrollTop(scrollTop: number, clientHeight: number, scrollHeight: number, delta: number): number`
  - `revealScrollTop(sentenceTop: number, scrollTop: number, clientHeight: number, scrollHeight: number): number | null`

- [ ] **Step 1: 寫失敗的測試**

新檔 `src/reader/scroll.test.ts`：

```ts
import { describe, expect, test } from 'vitest'
import { atEnd, atStart, clampScrollTop, revealScrollTop, turnScrollTop } from './scroll'

describe('滾動邊界', () => {
  test('頂端允許兩像素誤差', () => {
    expect(atStart(0)).toBe(true)
    expect(atStart(2)).toBe(true)
    expect(atStart(8)).toBe(false)
  })

  test('捲到底時算到章尾', () => {
    expect(atEnd(800, 600, 1400)).toBe(true)
    expect(atEnd(799, 600, 1400)).toBe(true)
    expect(atEnd(700, 600, 1400)).toBe(false)
  })

  test('內容比視窗短時一律算既在頂端也在章尾', () => {
    expect(atStart(0)).toBe(true)
    expect(atEnd(0, 600, 400)).toBe(true)
  })
})

describe('捲動目標', () => {
  test('夾在可捲動範圍內', () => {
    expect(clampScrollTop(-50, 600, 1400)).toBe(0)
    expect(clampScrollTop(9999, 600, 1400)).toBe(800)
    expect(clampScrollTop(300, 600, 1400)).toBe(300)
  })

  test('內容比視窗短時只能停在 0', () => {
    expect(clampScrollTop(300, 600, 400)).toBe(0)
  })

  test('翻一屏會留下重疊，避免被切掉的那行漏讀', () => {
    expect(turnScrollTop(0, 600, 3000, 1)).toBe(552)
    expect(turnScrollTop(552, 600, 3000, -1)).toBe(0)
  })

  test('翻一屏不會超出範圍', () => {
    expect(turnScrollTop(2300, 600, 3000, 1)).toBe(2400)
    expect(turnScrollTop(10, 600, 3000, -1)).toBe(0)
  })
})

describe('朗讀捲動', () => {
  test('句子已經在畫面上就不捲', () => {
    expect(revealScrollTop(700, 600, 600, 3000)).toBe(null)
  })

  test('句子在畫面下方時捲到上方三分之一', () => {
    expect(revealScrollTop(1500, 600, 600, 3000)).toBe(1300)
  })

  test('句子在畫面上方時往回捲', () => {
    expect(revealScrollTop(100, 600, 600, 3000)).toBe(0)
  })

  test('章尾的句子不會捲過頭', () => {
    expect(revealScrollTop(2950, 600, 600, 3000)).toBe(2400)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/reader/scroll.test.ts`
Expected: FAIL，`Failed to resolve import "./scroll"`

- [ ] **Step 3: 實作**

新檔 `src/reader/scroll.ts`：

```ts
/**
 * 直式滾動模式的邊界判定與捲動目標。
 * 只做數值運算，不碰 DOM，因此可以直接單元測試。
 */

/** 判定到頂／到底時容許的誤差：瀏覽器的 scrollTop 可能是小數。 */
const EDGE_EPSILON = 2

/** 翻一屏時保留的重疊高度，避免視窗邊緣被切一半的那行漏讀。 */
const TURN_OVERLAP = 48

export function atStart(scrollTop: number): boolean {
  return scrollTop <= EDGE_EPSILON
}

export function atEnd(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight >= scrollHeight - EDGE_EPSILON
}

/** 夾進 [0, 可捲動距離]。內容比視窗短時可捲動距離是 0。 */
export function clampScrollTop(top: number, clientHeight: number, scrollHeight: number): number {
  return Math.min(Math.max(0, top), Math.max(0, scrollHeight - clientHeight))
}

/** 往下（delta 1）或往上（delta -1）捲一個視窗高。 */
export function turnScrollTop(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  delta: number,
): number {
  const step = Math.max(1, clientHeight - TURN_OVERLAP)
  return clampScrollTop(scrollTop + delta * step, clientHeight, scrollHeight)
}

/**
 * 朗讀時要捲到哪裡。句子開頭已經在可視範圍內就回傳 null（不動畫面），
 * 否則把它放到畫面上方三分之一，後面還看得到幾行。
 */
export function revealScrollTop(
  sentenceTop: number,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): number | null {
  if (sentenceTop >= scrollTop && sentenceTop <= scrollTop + clientHeight) return null
  return clampScrollTop(sentenceTop - clientHeight / 3, clientHeight, scrollHeight)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run src/reader/scroll.test.ts`
Expected: PASS（11 個案例）

- [ ] **Step 5: Commit**

```bash
git add src/reader/scroll.ts src/reader/scroll.test.ts
git commit -m "feat: 滾動模式的邊界與捲動目標計算"
```

---

### Task 5: ScrollChapter 基本滾動

可切換到滾動模式、能依 `entry` 定位、會回報進度。章尾銜接與 `PagerApi` 留到 Task 6、7。

**Files:**
- Modify: `src/reader/pageMetrics.ts`
- Create: `src/reader/ScrollChapter.tsx`
- Modify: `src/reader/ChapterView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `scripts/verify.mjs`

**Interfaces:**
- Consumes: Task 3 的 `useChapterContent`、Task 4 的 `clampScrollTop`
- Produces:
  - `pageMetrics.ts`：`scrollTopForCharOffset(content: HTMLElement, charOffset: number): number`、`scrollTopForElement(content: HTMLElement, element: Element): number`、`charOffsetAtScrollTop(content: HTMLElement, scrollTop: number): number`
  - `ScrollChapter(props: ChapterViewProps)`

- [ ] **Step 1: pageMetrics 加上垂直量測**

`src/reader/pageMetrics.ts` 檔尾加入：

```ts
/** 某個字元位移相對內容頂端的垂直位置。 */
function offsetTop(content: HTMLElement, charOffset: number): number | null {
  const range = createRange(content, charOffset, charOffset + 1)
  if (!range) return null
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return rect.top - content.getBoundingClientRect().top
}

/** 要讓某個字元位移出現在視窗頂端，該捲到的 scrollTop。 */
export function scrollTopForCharOffset(content: HTMLElement, charOffset: number): number {
  return offsetTop(content, charOffset) ?? 0
}

/** 要讓某個元素出現在視窗頂端，該捲到的 scrollTop。 */
export function scrollTopForElement(content: HTMLElement, element: Element): number {
  return element.getBoundingClientRect().top - content.getBoundingClientRect().top
}

/**
 * 視窗頂端那個字的字元位移。
 * 文字在單欄版面裡垂直位置單調遞增，所以可以二分搜尋，與 charOffsetAtPage 同理。
 */
export function charOffsetAtScrollTop(content: HTMLElement, scrollTop: number): number {
  if (scrollTop <= 0) return 0
  const length = plainText(content).length
  let low = 0
  let high = Math.max(0, length - 1)

  while (low < high) {
    const middle = (low + high) >> 1
    if ((offsetTop(content, middle) ?? 0) < scrollTop) low = middle + 1
    else high = middle
  }
  return low
}
```

- [ ] **Step 2: 建立 ScrollChapter**

新檔 `src/reader/ScrollChapter.tsx`：

```tsx
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { useChapterContent } from './useChapterContent'
import { charOffsetAtScrollTop, scrollTopForCharOffset, scrollTopForElement } from './pageMetrics'
import { plainText } from './textRange'
import { clampScrollTop } from './scroll'

export function ScrollChapter({
  chapter,
  annotations,
  entry,
  layoutKey,
  highlightRange,
  speakingRange,
  pagerRef,
  onNavigate,
  onSelect,
  onAnnotationClick,
  onPastEnd,
  onPastStart,
  onPositionChange,
  onUserTurn,
}: ChapterViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useChapterContent({
    contentRef,
    chapter,
    annotations,
    highlightRange,
    speakingRange,
    onSelect,
    onNavigate,
    onAnnotationClick,
  })

  /** 依 entry 停到該停的位置 */
  const settle = useCallback((target: Entry) => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    // 分頁模式會把欄寬寫成行內樣式，切到滾動模式必須清掉
    content.style.height = ''
    content.style.width = ''
    content.style.columnWidth = ''
    content.style.columnGap = ''

    let top = 0
    if (target.kind === 'last') top = viewport.scrollHeight
    else if (target.kind === 'offset') top = scrollTopForCharOffset(content, target.offset)
    else if (target.kind === 'fragment' || target.kind === 'annotation') {
      const selector =
        target.kind === 'fragment'
          ? `#${CSS.escape(target.id)}`
          : `mark[data-annotation="${target.id}"]`
      const element = content.querySelector(selector)
      top = element ? scrollTopForElement(content, element) : 0
    }
    viewport.scrollTop = clampScrollTop(top, viewport.clientHeight, viewport.scrollHeight)
  }, [])

  useLayoutEffect(() => {
    settle(entry)
  }, [chapter.html, annotations, highlightRange, entry, layoutKey, settle])

  // 回報目前位置供進度記錄。滾動事件很密集，用 rAF 收斂成每幀一次。
  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    let frame = 0
    const report = () => {
      frame = 0
      onPositionChange(charOffsetAtScrollTop(content, viewport.scrollTop), plainText(content).length)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }

    report()
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [chapter.index, layoutKey, onPositionChange])

  // 章尾銜接在 Task 6 接上，PagerApi 在 Task 7 接上
  void pagerRef
  void onPastEnd
  void onPastStart
  void onUserTurn

  return (
    <div className="pager pager--scroll" ref={viewportRef}>
      <div className="chapter" ref={contentRef} lang="zh-TW" />
    </div>
  )
}
```

- [ ] **Step 3: ChapterView 真的分派**

`src/reader/ChapterView.tsx` 改成：

```tsx
import type { ChapterViewProps } from './chapterTypes'
import { PagedChapter } from './PagedChapter'
import { ScrollChapter } from './ScrollChapter'

/** 依設定選擇版面：橫向分頁或直式滾動。 */
export function ChapterView({ scroll, ...props }: ChapterViewProps & { scroll: boolean }) {
  return scroll ? <ScrollChapter {...props} /> : <PagedChapter {...props} />
}
```

- [ ] **Step 4: 切換模式時停在原本的位置**

`src/App.tsx`：在 `const pagerRef = useRef<PagerApi | null>(null)` 之後加：

```tsx
  /** 最後回報的字元位移，切換版面模式時用來留在原處 */
  const positionRef = useRef(0)
  const modeRef = useRef(settings.scroll)

  const onPositionChange = useCallback(
    (charOffset: number, length: number) => {
      positionRef.current = charOffset
      reportPosition(charOffset, length)
    },
    [reportPosition],
  )

  // 切換分頁／滾動會換掉整個版面元件，要主動回到原本讀到的位置
  useEffect(() => {
    if (modeRef.current === settings.scroll) return
    modeRef.current = settings.scroll
    if (chapter) void goToChapter(chapter.index, { kind: 'offset', offset: positionRef.current })
  }, [settings.scroll, chapter, goToChapter])
```

再把 `<ChapterView>` 的 `onPositionChange={reportPosition}` 改成 `onPositionChange={onPositionChange}`。

- [ ] **Step 5: 樣式**

`src/styles.css` 的 `.pager { ... }` 區塊之後加入：

```css
/* 直式滾動：捲軸在閱讀區裡面，整頁仍然不捲動 */
.pager--scroll {
  overflow-y: auto;
  overflow-x: hidden;
  cursor: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.pager--scroll .chapter {
  column-fill: balance;
  will-change: auto;
  padding-bottom: 2rem;
}
```

- [ ] **Step 6: verify.mjs 加滾動模式案例**

在 `scripts/verify.mjs` 的「回到書櫃」那段之前插入：

```js
  // 直式滾動：切換模式後內容改為垂直捲動
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.click('.setting--row:has-text("直式滾動") input')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.pager--scroll', { timeout: 5000 })
  await page.waitForTimeout(600)

  const scrollBox = await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    return { scrollHeight: pager.scrollHeight, clientHeight: pager.clientHeight }
  })
  if (scrollBox.scrollHeight <= scrollBox.clientHeight)
    fail(`滾動模式的內容沒有超出視窗：${scrollBox.scrollHeight} / ${scrollBox.clientHeight}`)

  const pageStillFixed = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  if (pageStillFixed > 0) fail(`滾動模式下整頁也跟著捲動 ${pageStillFixed}px`)
  await page.screenshot({ path: `${outDir}/20-scroll.png` })

  // 捲到中段後重新載入，應回到大致相同的位置
  await page.evaluate(() => document.querySelector('.pager--scroll').scrollTo({ top: 1200 }))
  await page.waitForTimeout(1200)
  const scrollBefore = await page.evaluate(() => ({
    top: document.querySelector('.pager--scroll').scrollTop,
    title: document.querySelector('.topbar__title').textContent,
  }))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.pager--scroll')
  await page.waitForTimeout(1200)
  const scrollAfter = await page.evaluate(() => ({
    top: document.querySelector('.pager--scroll').scrollTop,
    title: document.querySelector('.topbar__title').textContent,
  }))
  if (scrollAfter.title !== scrollBefore.title)
    fail(`滾動模式重新載入後章節不同：${scrollBefore.title} → ${scrollAfter.title}`)
  if (Math.abs(scrollAfter.top - scrollBefore.top) > 80)
    fail(`滾動模式重新載入後位置差太多：${scrollBefore.top} → ${scrollAfter.top}`)
  await page.screenshot({ path: `${outDir}/21-scroll-restored.png` })
```

- [ ] **Step 7: 執行驗證**

Run: `npx tsc -b && npm test && npm run build && node scripts/verify.mjs`
Expected: 全部通過，`screenshots/20-scroll.png` 看得到單欄直排內容

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 直式滾動模式的版面與位置記錄"
```

---

### Task 6: 章尾與章首銜接

**Files:**
- Modify: `src/reader/ScrollChapter.tsx`
- Test: `scripts/verify.mjs`

**Interfaces:**
- Consumes: Task 4 的 `atStart`、`atEnd`
- Produces: 滾動模式的 `onPastEnd` / `onPastStart` 觸發時機

- [ ] **Step 1: 加上邊界偵測**

`src/reader/ScrollChapter.tsx`：刪掉 `void onPastEnd` 與 `void onPastStart` 兩行，檔頭 import 補上 `atEnd, atStart`，並在 `settle` 之後加：

```tsx
  /** 上次換章的時間，用來擋住慣性滾動連續觸發 */
  const crossedAtRef = useRef(0)
```

在 `settle` 函式裡、設定 `viewport.scrollTop` 之後加一行，避免剛進新章時殘留的慣性立刻又換章：

```tsx
    crossedAtRef.current = Date.now()
```

接著在進度回報的 effect 之後加：

```tsx
  // 已經到底（或到頂）之後，再往同方向滑一次才換章
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const cross = (forward: boolean) => {
      const now = Date.now()
      if (now - crossedAtRef.current < EDGE_COOLDOWN_MS) return
      const { scrollTop, clientHeight, scrollHeight } = viewport
      if (forward ? !atEnd(scrollTop, clientHeight, scrollHeight) : !atStart(scrollTop)) return
      crossedAtRef.current = now
      if (forward) onPastEnd()
      else onPastStart()
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 4) return
      cross(event.deltaY > 0)
    }

    let startY = 0
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0].clientY
    }
    const onTouchMove = (event: TouchEvent) => {
      const dy = event.touches[0].clientY - startY
      if (Math.abs(dy) < 60) return
      cross(dy < 0)
    }

    viewport.addEventListener('wheel', onWheel, { passive: true })
    viewport.addEventListener('touchstart', onTouchStart, { passive: true })
    viewport.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('touchstart', onTouchStart)
      viewport.removeEventListener('touchmove', onTouchMove)
    }
  }, [onPastEnd, onPastStart])
```

檔頭常數區（import 之後）加：

```tsx
/** 換章後的冷卻時間，避免慣性滾動一路翻過好幾章 */
const EDGE_COOLDOWN_MS = 600
```

- [ ] **Step 2: verify.mjs 加換章案例**

接在 Task 5 加的那段之後：

```js
  // 章尾銜接：捲到底之後再滑一次才換章
  const scrollTitle = () => page.textContent('.topbar__title')
  const beforeCross = await scrollTitle()
  await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    pager.scrollTop = pager.scrollHeight
  })
  await page.waitForTimeout(900)
  if ((await scrollTitle()) !== beforeCross) fail('滾動到底就直接換章了，應該要再滑一次')

  await page.mouse.move(400, 600)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(900)
  const afterCross = await scrollTitle()
  if (afterCross === beforeCross) fail('滾動到底再滑一次沒有換到下一章')
  const enteredTop = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  if (enteredTop > 4) fail(`換章後沒有回到章首：scrollTop ${enteredTop}`)
  await page.screenshot({ path: `${outDir}/22-scroll-next-chapter.png` })

  // 章首銜接：在頂端往上滑回到上一章的章尾
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(900)
  if ((await scrollTitle()) !== beforeCross) fail('在章首往上滑沒有回到上一章')
  const backTop = await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    return pager.scrollHeight - pager.clientHeight - pager.scrollTop
  })
  if (backTop > 8) fail(`往回換章沒有停在上一章章尾：距底 ${backTop}px`)
```

- [ ] **Step 3: 執行驗證**

Run: `npx tsc -b && npm test && npm run build && node scripts/verify.mjs`
Expected: 全部通過

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: 滾動模式的章尾與章首銜接"
```

---

### Task 7: 鍵盤翻頁與朗讀捲動

**Files:**
- Modify: `src/reader/ScrollChapter.tsx`
- Test: `scripts/verify.mjs`

**Interfaces:**
- Consumes: Task 4 的 `turnScrollTop`、`revealScrollTop`、`atStart`、`atEnd`
- Produces: 滾動模式下可用的 `PagerApi`（`turn`、`reveal`）

- [ ] **Step 1: 實作 PagerApi**

`src/reader/ScrollChapter.tsx`：刪掉 `void pagerRef` 與 `void onUserTurn` 兩行，import 補上 `revealScrollTop, turnScrollTop`，並加入：

```tsx
  /** 分辨是程式捲動還是使用者自己捲的：朗讀捲動不該被當成使用者跳讀 */
  const programmaticRef = useRef(false)

  const turn = useCallback(
    (delta: number) => {
      const viewport = viewportRef.current
      const content = contentRef.current
      if (!viewport || !content) return
      const { scrollTop, clientHeight, scrollHeight } = viewport

      if (delta > 0 && atEnd(scrollTop, clientHeight, scrollHeight)) {
        onPastEnd()
        return
      }
      if (delta < 0 && atStart(scrollTop)) {
        onPastStart()
        return
      }

      const top = turnScrollTop(scrollTop, clientHeight, scrollHeight, delta)
      viewport.scrollTo({ top, behavior: 'smooth' })
      if (onUserTurn) onUserTurn(charOffsetAtScrollTop(content, top))
    },
    [onPastEnd, onPastStart, onUserTurn],
  )

  const reveal = useCallback((offset: number) => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const top = revealScrollTop(
      scrollTopForCharOffset(content, offset),
      viewport.scrollTop,
      viewport.clientHeight,
      viewport.scrollHeight,
    )
    if (top === null) return
    programmaticRef.current = true
    viewport.scrollTo({ top, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    pagerRef.current = { turn, reveal }
    return () => {
      pagerRef.current = null
    }
  }, [pagerRef, turn, reveal])
```

- [ ] **Step 2: 使用者自己捲動時讓朗讀跟上**

把進度回報 effect 裡的 `report` 改成：

```tsx
    const report = () => {
      frame = 0
      const offset = charOffsetAtScrollTop(content, viewport.scrollTop)
      onPositionChange(offset, plainText(content).length)
      if (programmaticRef.current) {
        programmaticRef.current = false
        return
      }
      if (onUserTurn) onUserTurn(offset)
    }
```

並把該 effect 的相依陣列補上 `onUserTurn`：

```tsx
  }, [chapter.index, layoutKey, onPositionChange, onUserTurn])
```

`onUserTurn` 在 `App.tsx` 只有朗讀中才會傳入，沒在朗讀時是 `undefined`，不會有額外成本。

- [ ] **Step 3: verify.mjs 加鍵盤與朗讀案例**

接在 Task 6 加的那段之後：

```js
  // 方向鍵在滾動模式要捲一屏
  const keyBefore = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(700)
  const keyAfter = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  if (keyAfter <= keyBefore) fail(`滾動模式方向鍵沒有往下捲：${keyBefore} → ${keyAfter}`)

  // 朗讀時正在念的句子要留在畫面上
  await page.click('[aria-label="開始朗讀"]')
  await page.waitForSelector('.chapter mark[data-speaking]', { timeout: 5000 })
  const speakingVisible = await page
    .waitForFunction(
      () => {
        const mark = document.querySelector('.chapter mark[data-speaking]')
        const pager = document.querySelector('.pager--scroll')
        if (!mark || !pager) return false
        const rect = mark.getClientRects()[0]
        const bounds = pager.getBoundingClientRect()
        return !!rect && rect.top >= bounds.top - 4 && rect.bottom <= bounds.bottom + 4
      },
      null,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false)
  if (!speakingVisible) fail('滾動模式下正在朗讀的句子沒有留在畫面上')
  await page.screenshot({ path: `${outDir}/23-scroll-narration.png` })
  await page.click('[aria-label="暫停朗讀"]')
  await page.waitForTimeout(300)

  // 切回分頁模式，分頁行為仍然正常
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.click('.setting--row:has-text("直式滾動") input')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  if (await page.$('.pager--scroll')) fail('關掉直式滾動後仍是滾動版面')
  const backToPaged = await readState(page)
  if (backToPaged.pages < 2) fail(`切回分頁後沒有重新分頁：總頁數 ${backToPaged.pages}`)
```

- [ ] **Step 4: 執行完整驗證**

Run: `npx tsc -b && npm test && npm run build && node scripts/verify.mjs`
Expected: 全部通過，`screenshots/` 多出 20～23 四張截圖

- [ ] **Step 5: 更新說明**

`src/reader/shortcuts.ts` 的 `SHORTCUT_HELP`，把第一、二項改成：

```ts
  { keys: '← / →', description: '上一頁 / 下一頁（滾動模式為上下捲動）' },
  { keys: 'Space', description: '下一頁 / 往下捲動' },
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 滾動模式支援鍵盤捲動與朗讀跟隨"
```
