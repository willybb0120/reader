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
