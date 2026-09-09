export interface Sentence {
  /** 章節純文字中的字元位移，與標註、搜尋共用同一套座標 */
  start: number
  end: number
  text: string
}

interface Options {
  /** 沒有標點的長句會被切到這個長度，避免語音引擎截斷 */
  maxLength?: number
}

const DEFAULT_MAX_LENGTH = 120
/** 句尾標點；連續出現時算同一個句尾 */
const TERMINATOR = /[。！？!?…；;\n]/

/** 半形句點後面接空白或結尾才算句尾，避免切壞小數點與縮寫 */
function isTerminator(source: string, i: number): boolean {
  if (TERMINATOR.test(source[i])) return true
  return source[i] === '.' && (i + 1 >= source.length || /\s/.test(source[i + 1]))
}
const BLANK = /^[\s　]*$/

function pushTrimmed(out: Sentence[], source: string, from: number, to: number): void {
  let start = from
  let end = to
  while (start < end && BLANK.test(source[start])) start++
  while (end > start && BLANK.test(source[end - 1])) end--
  if (start >= end) return
  out.push({ start, end, text: source.slice(start, end) })
}

/**
 * 把章節文字切成適合朗讀的句子。
 * 中文不需要斷詞，依句尾標點與換行切開就夠準；沒有標點的長段落再依長度切。
 */
export function splitSentences(source: string, options: Options = {}): Sentence[] {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
  const chunks: Sentence[] = []

  let from = 0
  for (let i = 0; i < source.length; i++) {
    if (!isTerminator(source, i)) continue
    // 連續標點（例如「？！」）一起收進同一句
    let end = i + 1
    while (end < source.length && isTerminator(source, end)) end++
    pushTrimmed(chunks, source, from, end)
    from = end
    i = end - 1
  }
  pushTrimmed(chunks, source, from, source.length)

  // 過長的句子再切，語音引擎對長字串不可靠
  const result: Sentence[] = []
  for (const chunk of chunks) {
    if (chunk.text.length <= maxLength) {
      result.push(chunk)
      continue
    }
    for (let offset = 0; offset < chunk.text.length; offset += maxLength) {
      const start = chunk.start + offset
      const end = Math.min(chunk.end, start + maxLength)
      result.push({ start, end, text: source.slice(start, end) })
    }
  }
  return result
}
