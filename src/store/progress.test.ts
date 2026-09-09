import { beforeEach, describe, expect, test } from 'vitest'
import { loadProgress, saveProgress, overallProgress } from './progress'

describe('閱讀進度儲存', () => {
  beforeEach(() => localStorage.clear())

  test('沒有紀錄時回傳 null', () => {
    expect(loadProgress('book-1')).toBeNull()
  })

  test('依書籍識別碼分別保存', () => {
    saveProgress('book-1', { chapterIndex: 3, ratio: 0.5 })
    saveProgress('book-2', { chapterIndex: 8, ratio: 0.1 })

    expect(loadProgress('book-1')?.chapterIndex).toBe(3)
    expect(loadProgress('book-2')?.chapterIndex).toBe(8)
  })

  test('保存時記錄更新時間', () => {
    saveProgress('book-1', { chapterIndex: 1, ratio: 0 })

    expect(loadProgress('book-1')!.updatedAt).toBeGreaterThan(0)
  })

  test('毀損的紀錄視為沒有進度', () => {
    localStorage.setItem('reader:progress:book-1', 'not json')

    expect(loadProgress('book-1')).toBeNull()
  })

  test('保存全書進度百分比，供書櫃顯示', () => {
    saveProgress('book-1', { chapterIndex: 2, ratio: 0.5, overall: 0.42 })

    expect(loadProgress('book-1')!.overall).toBeCloseTo(0.42)
  })

  test('舊資料沒有全書進度時視為 0', () => {
    localStorage.setItem('reader:progress:book-1', JSON.stringify({ chapterIndex: 1 }))

    expect(loadProgress('book-1')!.overall).toBe(0)
  })

  test('保存章內的起始字元位移，供分頁還原位置', () => {
    saveProgress('book-1', { chapterIndex: 2, ratio: 0.5, startOffset: 1840 })

    expect(loadProgress('book-1')!.startOffset).toBe(1840)
  })

  test('沒有起始位移的舊資料視為 0', () => {
    localStorage.setItem('reader:progress:book-1', JSON.stringify({ chapterIndex: 1 }))

    expect(loadProgress('book-1')!.startOffset).toBe(0)
  })

  test('舊版的 scrollRatio 欄位仍讀得到', () => {
    localStorage.setItem(
      'reader:progress:book-1',
      JSON.stringify({ chapterIndex: 1, scrollRatio: 0.75 }),
    )

    expect(loadProgress('book-1')!.ratio).toBe(0.75)
  })

  test('章內位置比例夾在 0 到 1 之間', () => {
    saveProgress('book-1', { chapterIndex: 0, ratio: 4.2 })

    expect(loadProgress('book-1')!.ratio).toBe(1)
  })
})

describe('overallProgress', () => {
  const lengths = [100, 300, 100] // 共 500 字

  test('第一章開頭是 0', () => {
    expect(overallProgress(lengths, 0, 0)).toBe(0)
  })

  test('最後一章讀完是 1', () => {
    expect(overallProgress(lengths, 2, 1)).toBe(1)
  })

  test('依章節字數加權，而非章節數', () => {
    expect(overallProgress(lengths, 1, 0.5)).toBeCloseTo(0.5)
  })

  test('沒有字數資料時退回以章節數估算', () => {
    expect(overallProgress([], 1, 0)).toBe(0)
  })
})
