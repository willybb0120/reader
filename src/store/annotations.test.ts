import { beforeEach, describe, expect, test } from 'vitest'
import {
  addAnnotation,
  listAnnotations,
  removeAnnotation,
  updateAnnotation,
  toMarkdown,
  type Annotation,
} from './annotations'

const draft = {
  chapterIndex: 2,
  chapterTitle: '覺知',
  start: 10,
  end: 20,
  text: '一段被畫線的文字',
  color: 'yellow' as const,
}

describe('標註儲存', () => {
  beforeEach(() => localStorage.clear())

  test('新書沒有任何標註', () => {
    expect(listAnnotations('book-1')).toEqual([])
  })

  test('新增後可以列出，並取得 id 與建立時間', () => {
    const created = addAnnotation('book-1', draft)

    const all = listAnnotations('book-1')
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(created.id)
    expect(all[0].createdAt).toBeGreaterThan(0)
    expect(all[0].text).toBe(draft.text)
  })

  test('依書籍分開存放', () => {
    addAnnotation('book-1', draft)

    expect(listAnnotations('book-2')).toEqual([])
  })

  test('依章節與位置排序', () => {
    addAnnotation('book-1', { ...draft, chapterIndex: 5, start: 0, end: 1 })
    addAnnotation('book-1', { ...draft, chapterIndex: 2, start: 90, end: 95 })
    addAnnotation('book-1', { ...draft, chapterIndex: 2, start: 10, end: 15 })

    expect(listAnnotations('book-1').map((a) => [a.chapterIndex, a.start])).toEqual([
      [2, 10],
      [2, 90],
      [5, 0],
    ])
  })

  test('可以補上筆記內容', () => {
    const created = addAnnotation('book-1', draft)

    updateAnnotation('book-1', created.id, { note: '這段很重要' })

    expect(listAnnotations('book-1')[0].note).toBe('這段很重要')
  })

  test('可以刪除', () => {
    const created = addAnnotation('book-1', draft)

    removeAnnotation('book-1', created.id)

    expect(listAnnotations('book-1')).toEqual([])
  })

  test('毀損的資料視為沒有標註', () => {
    localStorage.setItem('reader:annotations:book-1', '不是 JSON')

    expect(listAnnotations('book-1')).toEqual([])
  })
})

describe('toMarkdown', () => {
  test('依章節分組輸出引文與筆記', () => {
    const annotations: Annotation[] = [
      { ...draft, id: 'a', createdAt: 1, chapterIndex: 1, chapterTitle: '第一章', note: '筆記一' },
      { ...draft, id: 'b', createdAt: 2, chapterIndex: 1, chapterTitle: '第一章', text: '第二段' },
    ]

    const markdown = toMarkdown('書名', annotations)

    expect(markdown).toContain('# 書名')
    expect(markdown).toContain('## 第一章')
    expect(markdown).toContain('> 一段被畫線的文字')
    expect(markdown).toContain('筆記一')
    expect(markdown).toContain('> 第二段')
    expect(markdown.match(/## 第一章/g)).toHaveLength(1)
  })
})
