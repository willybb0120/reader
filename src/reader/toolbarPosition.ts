/**
 * 選取工具列的定位計算：純數字運算，不碰 DOM，方便單元測試
 *（依賴 getBoundingClientRect 的部分留在 SelectionToolbar，改在 verify.mjs 驗）。
 */

export interface ToolbarRect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

export interface ToolbarPosition {
  top: number
  left: number
  /** true 代表浮在選取範圍上方，false 代表浮在下方 */
  above: boolean
}

/** 選取範圍離視窗頂端要多遠，工具列才浮在上方；太近就改浮到下方，避免被裁掉 */
const TOP_MARGIN = 96
/** 浮在下方時，工具列 top 至少要留這個距離，避免貼齊視窗頂端 */
const BOTTOM_MARGIN = 60
/** 工具列左右不貼齊視窗邊緣，至少留這個寬度 */
const SIDE_MARGIN = 140
/** 工具列 top 的下限與上限之間，離視窗下緣留的緩衝 */
const EDGE_MARGIN = 24
/**
 * 上下翻面的遲滯帶寬度（fix round 1 / Finding 3）：rect.top 要跨過 TOP_MARGIN
 * 兩側各 24px 才會觸發翻面。改成即時重算位置後，捲動經過 96px 門檻附近時
 * rect.top 只要來回抖動幾像素就會讓工具列一直翻面；遲滯帶讓「已經在上方」
 * 與「已經在下方」各自多留一段緩衝，同一次捲動最多翻一次。
 */
const FLIP_HYSTERESIS = 24

/**
 * 決定這次要浮在上方還是下方。有上一次的方向就用遲滯帶：
 * 已經在上方，要掉到 TOP_MARGIN - FLIP_HYSTERESIS 以下才翻到下方；
 * 已經在下方，要升到 TOP_MARGIN + FLIP_HYSTERESIS 以上才翻回上方。
 * 沒有上一次方向（例如新選取／新標註，第一次量測）就用原本的門檻直接判斷。
 */
function resolveAbove(top: number, prevAbove: boolean | null): boolean {
  if (prevAbove === true) return top > TOP_MARGIN - FLIP_HYSTERESIS
  if (prevAbove === false) return top > TOP_MARGIN + FLIP_HYSTERESIS
  return top > TOP_MARGIN
}

/** rect 是否完全捲出可視範圍（上下左右任一方向皆可），是的話工具列要隱藏。 */
export function isFullyOutOfView(
  rect: ToolbarRect,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth
}

/**
 * 依 rect 與視窗尺寸算出工具列座標。
 * rect 完全捲出可視範圍時回傳 null，交給呼叫端隱藏工具列，而不是硬把它拉回畫面內。
 * prevAbove 是上一次算出的方向（沒有就傳 null），用來做遲滯判斷，見 resolveAbove。
 */
export function computeToolbarPosition(
  rect: ToolbarRect,
  viewportWidth: number,
  viewportHeight: number,
  prevAbove: boolean | null = null,
): ToolbarPosition | null {
  if (isFullyOutOfView(rect, viewportWidth, viewportHeight)) return null

  const above = resolveAbove(rect.top, prevAbove)
  const rawTop = above ? rect.top - 12 : rect.bottom + 12
  const top = Math.min(Math.max(rawTop, above ? TOP_MARGIN : BOTTOM_MARGIN), viewportHeight - EDGE_MARGIN)
  const left = Math.min(Math.max(rect.left + rect.width / 2, SIDE_MARGIN), viewportWidth - SIDE_MARGIN)

  return { top, left, above }
}

/**
 * 從多個候選 rect（同一個標註跨段落產生的多個 <mark> 片段）中選一個代表用來定位工具列。
 * 優先選目前在可視範圍內（哪怕只有一部分）的片段；如果全部都在畫面外，
 * 選離可視範圍最近的那個，這樣捲動時會自動換成當下看得到（或最接近看得到）的片段，
 * 而不是永遠釘住文件順序的第一個。
 */
export function pickVisibleRect<T extends { top: number; bottom: number }>(
  rects: readonly T[],
  viewportHeight: number,
): T | null {
  if (rects.length === 0) return null

  const inView = rects.find((rect) => rect.bottom >= 0 && rect.top <= viewportHeight)
  if (inView) return inView

  const distance = (rect: T) => (rect.top > viewportHeight ? rect.top - viewportHeight : -rect.bottom)
  return rects.reduce((closest, rect) => (distance(rect) < distance(closest) ? rect : closest))
}
