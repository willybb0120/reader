import { describe, expect, test, vi } from 'vitest'
import { plainText } from './textRange'
import {
  applyTranslations,
  batchTexts,
  chapterSentences,
  isEnglish,
  translateLines,
} from './translate'

/** 模擬 Google 回應：每行加上「譯:」前綴，並依句號切成多個片段 */
function fakeGoogle(transform = (line: string) => `譯:${line}`) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const q = new URLSearchParams(String(init?.body)).get('q') ?? ''
    const translated = q.split('\n').map(transform).join('\n')
    const segments = translated.split(/(?<=\.)/).map((part) => [part, '', null])
    return new Response(JSON.stringify([segments, null, 'en']))
  })
}

function root(html: string): HTMLElement {
  const element = document.createElement('div')
  element.innerHTML = html
  return element
}

describe('isEnglish', () => {
  test('辨識 en 與 en-US，不含中文', () => {
    expect(isEnglish('en')).toBe(true)
    expect(isEnglish('en-US')).toBe(true)
    expect(isEnglish('zh-TW')).toBe(false)
    expect(isEnglish('')).toBe(false)
  })
})

describe('batchTexts', () => {
  test('依字數上限分批，單段超長也自成一批', () => {
    expect(batchTexts(['aaa', 'bbb', 'cccccc', 'd'], 7)).toEqual([[0, 1], [2], [3]])
  })
})

describe('chapterSentences', () => {
  test('逐段切句，位移是章節純文字座標', () => {
    const container = root(
      '<h1>Title</h1><p>One here. Two <em>there</em>!  </p><p>  </p><blockquote><p>Quote.</p></blockquote>',
    )
    const text = plainText(container)
    const sentences = chapterSentences(container)

    expect(sentences.map((s) => s.text)).toEqual(['Title', 'One here.', 'Two there!', 'Quote.'])
    for (const s of sentences) expect(text.slice(s.start, s.end)).toBe(s.text)
  })
})

describe('applyTranslations', () => {
  test('譯文插在每句之後，不改動章節文字', () => {
    const container = root('<p>One here. Two <mark>there!</mark></p>')
    const before = plainText(container)
    const sentences = chapterSentences(container)

    applyTranslations(container, sentences, ['一', '二'])

    expect(plainText(container)).toBe(before)
    const notes = [...container.querySelectorAll<HTMLElement>('[data-tr]')]
    expect(notes.map((n) => n.dataset.tr)).toEqual(['一', '二'])
    // 句尾落在 <mark> 結尾時放到 mark 外面，譯文不會帶到劃線底色
    expect(notes[1].parentElement?.tagName).toBe('P')
    expect(notes[0].previousSibling?.textContent).toBe('One here.')
  })

  test('再次套用或清空時移除舊譯文', () => {
    const container = root('<p>One. Two.</p>')
    const sentences = chapterSentences(container)
    applyTranslations(container, sentences, ['一', '二'])
    applyTranslations(container, sentences, ['壹', undefined])
    expect([...container.querySelectorAll<HTMLElement>('[data-tr]')].map((n) => n.dataset.tr)).toEqual(['壹'])

    applyTranslations(container, sentences, undefined)
    expect(container.querySelectorAll('[data-tr]')).toHaveLength(0)
    expect(container.innerHTML).toBe('<p>One. Two.</p>')
  })
})

describe('translateLines', () => {
  test('一次請求翻多行，依換行對回各行', async () => {
    const fetcher = fakeGoogle()
    const result = await translateLines(['Hello. World.', 'Second\nline'], fetcher)
    expect(result).toEqual(['譯:Hello. World.', '譯:Second line'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('行數對不上時改成逐行翻譯', async () => {
    const fetcher = fakeGoogle((line) => `${line}\n多出來的一行`)
    const result = await translateLines(['A', 'B'], fetcher)
    expect(result).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  test('HTTP 失敗時丟出錯誤', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429 }))
    await expect(translateLines(['A'], fetcher)).rejects.toThrow('429')
  })
})
