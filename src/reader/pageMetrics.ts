import { createRange, plainText } from './textRange'
import { pageForOffset, type PageLayout } from './pagination'

/**
 * 分頁版面的量測。這些函式依賴真實排版結果，jsdom 量不到，
 * 因此由 scripts/verify.mjs 在真實瀏覽器裡驗證。
 */

/** 某個字元位移在內容座標上的水平位置（未套用翻頁位移）。 */
function offsetX(content: HTMLElement, charOffset: number): number | null {
  const range = createRange(content, charOffset, charOffset + 1)
  if (!range) return null
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return rect.left - content.getBoundingClientRect().left
}

/** 某個字元位移落在第幾頁。 */
export function pageForCharOffset(
  content: HTMLElement,
  charOffset: number,
  layout: PageLayout,
): number {
  const x = offsetX(content, charOffset)
  return x === null ? 0 : pageForOffset(x, layout)
}

/**
 * 某一頁開頭的字元位移。
 * 文字在多欄版面裡是依序流動的，位置隨位移單調遞增，所以可以二分搜尋。
 */
export function charOffsetAtPage(
  content: HTMLElement,
  page: number,
  layout: PageLayout,
): number {
  if (page <= 0) return 0
  const length = plainText(content).length
  let low = 0
  let high = Math.max(0, length - 1)

  while (low < high) {
    const middle = (low + high) >> 1
    if (pageForCharOffset(content, middle, layout) < page) low = middle + 1
    else high = middle
  }
  return low
}

/** 讀出目前的分頁尺寸。欄距寫在 CSS 的 --column-gap，樣式與計算共用同一個值。 */
export function readLayout(viewport: HTMLElement): PageLayout {
  const gap = Number.parseFloat(getComputedStyle(viewport).getPropertyValue('--column-gap'))
  return {
    pageWidth: viewport.clientWidth,
    gap: Number.isFinite(gap) ? gap : 0,
  }
}

/**
 * 把分欄尺寸寫進內容元素。
 * column-width 不接受百分比，必須給實際像素，所以這一步只能在 JS 做。
 */
export function applyLayout(
  viewport: HTMLElement,
  content: HTMLElement,
  layout: PageLayout,
): void {
  content.style.height = `${viewport.clientHeight}px`
  content.style.width = `${layout.pageWidth}px`
  content.style.columnWidth = `${layout.pageWidth}px`
  content.style.columnGap = `${layout.gap}px`
}
