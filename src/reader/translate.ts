/**
 * 沉浸式翻譯：用 Google 免費翻譯介面（非官方，免 key）把英文段落翻成繁體中文。
 * 多段以換行串成一次請求，回應再依換行切回各段。
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t'

/** 單次請求的字數上限。POST 不受網址長度限制，但太長容易被拒或回應變慢 */
const MAX_BATCH_CHARS = 4000

/** 會被翻譯的區塊。巢狀時只取最內層，避免同一段文字翻兩次 */
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, figcaption, blockquote'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export function isEnglish(language: string): boolean {
  return /^en\b/i.test(language.trim())
}

/** 章節裡要翻譯的區塊，依文件順序。原文與畫面上的 DOM 都用它，順序一致才對得回去 */
export function translatableBlocks(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter(
    (el) => !el.querySelector(BLOCK_SELECTOR) && (el.textContent ?? '').trim() !== '',
  )
}

/** 依字數上限把段落分批，回傳每批的段落索引 */
export function batchTexts(texts: readonly string[], maxChars = MAX_BATCH_CHARS): number[][] {
  const batches: number[][] = []
  let current: number[] = []
  let size = 0
  texts.forEach((text, index) => {
    if (current.length > 0 && size + text.length > maxChars) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(index)
    size += text.length + 1
  })
  if (current.length > 0) batches.push(current)
  return batches
}

async function request(text: string, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q: text }).toString(),
  })
  if (!response.ok) throw new Error(`翻譯服務回應 ${response.status}`)
  const data = (await response.json()) as [[string, ...unknown[]][]]
  return data[0].map((segment) => segment[0]).join('')
}

/** 翻譯一批段落。段內換行先壓成空白，換行留給分段用；切回來段數不符時退回逐段翻 */
export async function translateBlocks(
  texts: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const flat = texts.map((text) => text.replace(/\s+/g, ' ').trim())
  const lines = (await request(flat.join('\n'), fetcher)).split('\n')
  if (lines.length === flat.length) return lines.map((line) => line.trim())
  return Promise.all(flat.map(async (text) => (await request(text, fetcher)).trim()))
}
