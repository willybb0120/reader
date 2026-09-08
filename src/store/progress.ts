export interface Progress {
  chapterIndex: number
  /** 章節內的捲動位置，0 至 1 */
  scrollRatio: number
  /** 全書進度，0 至 1。存起來讓書櫃不必重新解析整本書 */
  overall: number
  updatedAt: number
}

const KEY_PREFIX = 'reader:progress:'

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0
}

export function loadProgress(bookId: string): Progress | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + bookId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Progress>
    if (typeof parsed.chapterIndex !== 'number') return null
    return {
      chapterIndex: Math.max(0, Math.trunc(parsed.chapterIndex)),
      scrollRatio: clamp01(parsed.scrollRatio),
      overall: clamp01(parsed.overall),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function saveProgress(
  bookId: string,
  progress: Omit<Progress, 'updatedAt' | 'overall'> & { overall?: number },
): void {
  try {
    const record: Progress = {
      chapterIndex: Math.max(0, Math.trunc(progress.chapterIndex)),
      scrollRatio: clamp01(progress.scrollRatio),
      overall: clamp01(progress.overall),
      updatedAt: Date.now(),
    }
    localStorage.setItem(KEY_PREFIX + bookId, JSON.stringify(record))
  } catch {
    // 空間不足或私密瀏覽：進度僅在本次工作階段有效
  }
}

/**
 * 全書進度。以各章字數加權，字數未知時退回以章節數平均估算。
 */
export function overallProgress(
  chapterLengths: readonly number[],
  chapterIndex: number,
  scrollRatio: number,
): number {
  const total = chapterLengths.reduce((sum, length) => sum + length, 0)
  if (total === 0) return 0

  const before = chapterLengths
    .slice(0, chapterIndex)
    .reduce((sum, length) => sum + length, 0)
  const current = chapterLengths[chapterIndex] ?? 0
  return Math.min(1, (before + current * clamp01(scrollRatio)) / total)
}

/** 中文閱讀速度，字／分鐘。 */
const CHARS_PER_MINUTE = 350

/** 依剩餘字數估算讀完全書還需要幾分鐘；沒有字數資料時回傳 null。 */
export function remainingMinutes(
  chapterLengths: readonly number[],
  chapterIndex: number,
  scrollRatio: number,
  charsPerMinute = CHARS_PER_MINUTE,
): number | null {
  const total = chapterLengths.reduce((sum, length) => sum + length, 0)
  if (total === 0) return null

  const remaining = total * (1 - overallProgress(chapterLengths, chapterIndex, scrollRatio))
  if (remaining <= 0) return 0
  return Math.max(1, Math.round(remaining / charsPerMinute))
}
