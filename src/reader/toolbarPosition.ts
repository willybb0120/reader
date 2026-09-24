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
 */
export function computeToolbarPosition(
  rect: ToolbarRect,
  viewportWidth: number,
  viewportHeight: number,
): ToolbarPosition | null {
  if (isFullyOutOfView(rect, viewportWidth, viewportHeight)) return null

  const above = rect.top > TOP_MARGIN
  const rawTop = above ? rect.top - 12 : rect.bottom + 12
  const top = Math.min(Math.max(rawTop, above ? TOP_MARGIN : BOTTOM_MARGIN), viewportHeight - EDGE_MARGIN)
  const left = Math.min(Math.max(rect.left + rect.width / 2, SIDE_MARGIN), viewportWidth - SIDE_MARGIN)

  return { top, left, above }
}
