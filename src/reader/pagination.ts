/**
 * 分頁版面的計算。
 * 內容用 CSS 多欄排版，一欄就是一頁；翻頁 = 水平位移一個「頁寬 + 欄距」。
 */

export interface PageLayout {
  pageWidth: number
  gap: number
}

/** 一頁佔用的水平距離（含右側欄距）。 */
function stride({ pageWidth, gap }: PageLayout): number {
  return pageWidth + gap
}

/** 由內容總寬換算頁數。總寬為 n 頁時等於 n*(頁寬+欄距) - 欄距。 */
export function pageCount(scrollWidth: number, layout: PageLayout): number {
  if (layout.pageWidth <= 0) return 1
  const pages = Math.ceil((scrollWidth + layout.gap) / stride(layout) - 0.01)
  return Math.max(1, pages)
}

/** 第 n 頁要位移的距離。 */
export function translateForPage(page: number, layout: PageLayout): number {
  return Math.max(0, page) * stride(layout)
}

/** 內容座標 x 落在第幾頁。落在欄距上（不會有文字）時算下一頁。 */
export function pageForOffset(x: number, layout: PageLayout): number {
  if (layout.pageWidth <= 0) return 0
  const page = Math.floor(Math.max(0, x) / stride(layout))
  const within = Math.max(0, x) - page * stride(layout)
  return within >= layout.pageWidth ? page + 1 : page
}
