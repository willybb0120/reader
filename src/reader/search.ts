export interface SearchHit {
  chapterIndex: number
  /** 章節純文字中的字元位移 */
  start: number
  end: number
  /** 顯示用片段，已把連續空白收成單一空格 */
  before: string
  match: string
  after: string
}

interface SearchOptions {
  /** 片段前後保留的字元數 */
  context?: number
  limit?: number
}

/** 內文常有全形空白縮排與換行，顯示片段時收成單一空格 */
function tidy(text: string): string {
  return text.replace(/[\s\u3000]+/g, ' ')
}

const DEFAULT_CONTEXT = 24
const DEFAULT_LIMIT = 200

/**
 * 在各章純文字中做子字串比對。
 * 中文不需要斷詞，直接比對子字串比任何分詞方案都準確。
 */
export function searchChapters(
  texts: readonly string[],
  query: string,
  { context = DEFAULT_CONTEXT, limit = DEFAULT_LIMIT }: SearchOptions = {},
): SearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const hits: SearchHit[] = []

  for (let chapterIndex = 0; chapterIndex < texts.length; chapterIndex++) {
    const text = texts[chapterIndex]
    const haystack = text.toLowerCase()

    let from = 0
    while (hits.length < limit) {
      const start = haystack.indexOf(needle, from)
      if (start === -1) break
      const end = start + needle.length
      hits.push({
        chapterIndex,
        start,
        end,
        before: tidy(text.slice(Math.max(0, start - context), start)),
        match: text.slice(start, end),
        after: tidy(text.slice(end, Math.min(text.length, end + context))),
      })
      from = start + 1
    }
    if (hits.length >= limit) break
  }

  return hits
}
