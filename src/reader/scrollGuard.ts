/**
 * 程式捲動（翻頁／朗讀跟隨／重排）旗標的邏輯。
 * 純狀態機，不碰 DOM 或 rect，方便寫 vitest；scrollTop、scrollend 等量測與事件交給呼叫端。
 */

/** 沒有 scrollend 事件的瀏覽器上，程式捲動最多被視為進行中這麼久 */
export const PROGRAMMATIC_SCROLL_TIMEOUT_MS = 1200

export interface ProgrammaticScrollGuard {
  /** 標記接下來的捲動是程式造成的 */
  begin: () => void
  /** 目前是否處於程式捲動中 */
  readonly active: boolean
  /** scrollend 事件收尾：清掉逾時後備並解除旗標 */
  onScrollEnd: () => void
  /** 元件卸載時呼叫，避免逾時計時器外洩 */
  dispose: () => void
}

export function createProgrammaticScrollGuard(
  timeoutMs = PROGRAMMATIC_SCROLL_TIMEOUT_MS,
): ProgrammaticScrollGuard {
  let active = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const clearTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  return {
    begin() {
      active = true
      clearTimer()
      timer = setTimeout(() => {
        timer = undefined
        active = false
      }, timeoutMs)
    },
    get active() {
      return active
    },
    onScrollEnd() {
      clearTimer()
      active = false
    },
    dispose() {
      clearTimer()
    },
  }
}
