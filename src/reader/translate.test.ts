import { describe, expect, test, vi } from 'vitest'
import { batchTexts, isEnglish, translateBlocks, translatableBlocks } from './translate'

/** 模擬 Google 回應：把每行加上「譯:」前綴，並依句號切成多個片段 */
function fakeGoogle(transform = (line: string) => `譯:${line}`) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const q = new URLSearchParams(String(init?.body)).get('q') ?? ''
    const translated = q.split('\n').map(transform).join('\n')
    const segments = translated.split(/(?<=\.)/).map((part) => [part, '', null])
    return new Response(JSON.stringify([segments, null, 'en']))
  })
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

describe('translatableBlocks', () => {
  test('取出有文字的段落，不重複取巢狀區塊', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<h1>Title</h1><p>One</p><p>  </p><blockquote><p>Quote</p></blockquote><ul><li>Item</li></ul><p><img></p>'
    expect(translatableBlocks(root).map((el) => el.textContent)).toEqual([
      'Title',
      'One',
      'Quote',
      'Item',
    ])
  })
})

describe('translateBlocks', () => {
  test('一次請求翻多段，依換行對回各段', async () => {
    const fetcher = fakeGoogle()
    const result = await translateBlocks(['Hello. World.', 'Second\nline'], fetcher)
    expect(result).toEqual(['譯:Hello. World.', '譯:Second line'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('段數對不上時改成逐段翻譯', async () => {
    const fetcher = fakeGoogle((line) => `${line}\n多出來的一行`)
    const result = await translateBlocks(['A', 'B'], fetcher)
    expect(result).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  test('HTTP 失敗時丟出錯誤', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429 }))
    await expect(translateBlocks(['A'], fetcher)).rejects.toThrow('429')
  })
})
