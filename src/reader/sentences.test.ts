import { describe, expect, test } from 'vitest'
import { splitSentences } from './sentences'

const text = (source: string) => splitSentences(source).map((s) => s.text)

describe('splitSentences', () => {
  test('依句號切開', () => {
    expect(text('第一句。第二句。')).toEqual(['第一句。', '第二句。'])
  })

  test('位移指回原文', () => {
    const source = '第一句。第二句。'

    const [, second] = splitSentences(source)

    expect(source.slice(second.start, second.end)).toBe('第二句。')
  })

  test('問號與驚嘆號也是句尾', () => {
    expect(text('這樣嗎？當然！')).toEqual(['這樣嗎？', '當然！'])
  })

  test('連續標點算同一句', () => {
    expect(text('真的嗎？！好吧。')).toEqual(['真的嗎？！', '好吧。'])
  })

  test('換行也切句', () => {
    expect(text('食物、\n棲身之所、\n天敵')).toEqual(['食物、', '棲身之所、', '天敵'])
  })

  test('略過只有空白的片段', () => {
    expect(text('前段。\n\n　　\n後段。')).toEqual(['前段。', '後段。'])
  })

  test('句首的全形空白不算在範圍內', () => {
    const source = '　　開頭有縮排。'

    const [first] = splitSentences(source)

    expect(first.text).toBe('開頭有縮排。')
    expect(source.slice(first.start, first.end)).toBe('開頭有縮排。')
  })

  test('沒有標點的長句會被切成可念的長度', () => {
    const source = '甲'.repeat(250)

    const sentences = splitSentences(source, { maxLength: 100 })

    expect(sentences).toHaveLength(3)
    expect(sentences[0].text).toHaveLength(100)
    expect(sentences.map((s) => s.text).join('')).toBe(source)
  })

  test('英文句點也切句', () => {
    expect(text('First one. Second one.')).toEqual(['First one.', 'Second one.'])
  })

  test('空字串沒有句子', () => {
    expect(splitSentences('   \n　 ')).toEqual([])
  })
})
