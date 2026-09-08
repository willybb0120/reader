import { describe, expect, test } from 'vitest'
import { searchChapters } from './search'

const texts = [
  '創造力是一種存在的方式，人人都是創造者。',
  '第二章談的是覺知，覺知讓我們注意到周圍。',
  '',
]

describe('searchChapters', () => {
  test('空查詢沒有結果', () => {
    expect(searchChapters(texts, '  ')).toEqual([])
  })

  test('找出所有出現位置與所在章節', () => {
    const hits = searchChapters(texts, '覺知')

    expect(hits).toHaveLength(2)
    expect(hits[0].chapterIndex).toBe(1)
    expect(texts[1].slice(hits[0].start, hits[0].end)).toBe('覺知')
    expect(hits[1].start).toBeGreaterThan(hits[0].start)
  })

  test('片段包含前後文並分開標出命中字串', () => {
    const hits = searchChapters(['0123456789abcdefghij'], '789', { context: 3 })

    expect(hits[0].before).toBe('456')
    expect(hits[0].match).toBe('789')
    expect(hits[0].after).toBe('abc')
  })

  test('片段中的連續空白收成單一空格', () => {
    const hits = searchChapters(['甲　　乙丙丁　\n　戊'], '丙', { context: 5 })

    expect(hits[0].before).toBe('甲 乙')
    expect(hits[0].after).toBe('丁 戊')
  })

  test('忽略英文大小寫', () => {
    expect(searchChapters(['The Creative Act'], 'creative')).toHaveLength(1)
  })

  test('限制回傳數量', () => {
    const hits = searchChapters(['aaaaaa'], 'a', { limit: 3 })

    expect(hits).toHaveLength(3)
  })

  test('重疊的比對不會無限迴圈', () => {
    expect(searchChapters(['aaa'], 'aa')).toHaveLength(2)
  })
})
