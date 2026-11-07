/**
 * 沉浸式翻譯：用 Google 免費翻譯介面（非官方，免 key）把英文逐句翻成繁體中文。
 * 多句以換行串成一次請求，回應再依換行切回各句。
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t'

/** 單次請求的字數上限。POST 不受網址長度限制，但太長容易被拒或回應變慢 */
const MAX_BATCH_CHARS = 4000

/** 會被翻譯的區塊。巢狀時只取最內層，避免同一段文字翻兩次 */
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, figcaption, blockquote'

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export interface Sentence {
  /** 章節純文字中的字元位移，與標註、進度共用同一套座標 */
  start: number
  end: number
  text: string
}

export function isEnglish(language: string): boolean {
  return /^en\b/i.test(language.trim())
}

function translatableBlocks(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter(
    (el) => !el.querySelector(BLOCK_SELECTOR) && (el.textContent ?? '').trim() !== '',
  )
}

/** 章節裡要翻譯的句子，依文件順序。原文與畫面上的 DOM 都用它，順序一致才對得回去 */
export function chapterSentences(root: HTMLElement): Sentence[] {
  const sentences: Sentence[] = []
  for (const block of translatableBlocks(root)) {
    const probe = root.ownerDocument.createRange()
    probe.setStart(root, 0)
    probe.setEnd(block, 0)
    const base = probe.toString().length
    const text = block.textContent ?? ''
    for (const { segment, index } of segmenter.segment(text)) {
      let start = index
      let end = index + segment.length
      while (start < end && /\s/.test(text[start])) start++
      while (end > start && /\s/.test(text[end - 1])) end--
      if (start < end) sentences.push({ start: base + start, end: base + end, text: text.slice(start, end) })
    }
  }
  return sentences
}

/**
 * 在每句結尾插入一個沒有文字的 <span data-tr>，由 CSS ::after 顯示譯文。
 * 只切分文字節點、不新增文字，所以章節純文字與所有字元位移都不變。
 */
export function applyTranslations(
  root: HTMLElement,
  sentences: readonly Sentence[],
  translations: readonly (string | undefined)[] | undefined,
): void {
  for (const old of root.querySelectorAll('[data-tr]')) {
    const parent = old.parentNode
    old.remove()
    parent?.normalize()
  }
  if (!translations) return

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number }[] = []
  let consumed = 0
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    nodes.push({ node, start: consumed })
    consumed += node.data.length
  }

  // 由後往前插：切分只會把文字節點的後半段拆出去，前面句子用到的節點與起點都不變
  let cursor = nodes.length - 1
  for (let i = sentences.length - 1; i >= 0; i--) {
    const text = translations[i]
    if (!text) continue
    const { end } = sentences[i]
    while (cursor > 0 && nodes[cursor].start >= end) cursor--
    const { node, start } = nodes[cursor]
    if (end - start < node.data.length) node.splitText(end - start)

    // 句尾剛好在劃線或連結的結尾時放到元素外面，譯文才不會帶著它們的樣式
    let anchor: Node = node
    while (
      !anchor.nextSibling &&
      anchor.parentElement &&
      anchor.parentElement !== root &&
      !anchor.parentElement.matches(BLOCK_SELECTOR)
    ) {
      anchor = anchor.parentElement
    }
    const note = root.ownerDocument.createElement('span')
    note.dataset.tr = text
    anchor.parentNode?.insertBefore(note, anchor.nextSibling)
  }
}

/** 依字數上限把句子分批，回傳每批的索引 */
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

/** 翻譯一批句子。句內換行先壓成空白，換行留給分句用；切回來行數不符時退回逐行翻 */
export async function translateLines(
  texts: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const flat = texts.map((text) => text.replace(/\s+/g, ' ').trim())
  const lines = (await request(flat.join('\n'), fetcher)).split('\n')
  if (lines.length === flat.length) return lines.map((line) => line.trim())
  return Promise.all(flat.map(async (text) => (await request(text, fetcher)).trim()))
}
