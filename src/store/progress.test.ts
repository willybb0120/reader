import { beforeEach, describe, expect, test } from 'vitest'
import { loadProgress, saveProgress, overallProgress, remainingMinutes } from './progress'

describe('閱讀進度儲存', () => {
  beforeEach(() => localStorage.clear())

  test('沒有紀錄時回傳 null', () => {
    expect(loadProgress('book-1')).toBeNull()
  })

  test('依書籍識別碼分別保存', () => {
    saveProgress('book-1', { chapterIndex: 3, scrollRatio: 0.5 })
    saveProgress('book-2', { chapterIndex: 8, scrollRatio: 0.1 })

    expect(loadProgress('book-1')?.chapterIndex).toBe(3)
    expect(loadProgress('book-2')?.chapterIndex).toBe(8)
  })

  test('保存時記錄更新時間', () => {
    saveProgress('book-1', { chapterIndex: 1, scrollRatio: 0 })

    expect(loadProgress('book-1')!.updatedAt).toBeGreaterThan(0)
  })

  test('毀損的紀錄視為沒有進度', () => {
    localStorage.setItem('reader:progress:book-1', 'not json')

    expect(loadProgress('book-1')).toBeNull()
  })

  test('捲動比例夾在 0 到 1 之間', () => {
    saveProgress('book-1', { chapterIndex: 0, scrollRatio: 4.2 })

    expect(loadProgress('book-1')!.scrollRatio).toBe(1)
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

describe('remainingMinutes', () => {
  const lengths = [3500, 3500] // 共 7000 字，350 字/分鐘 → 20 分鐘

  test('全書未讀時是總時長', () => {
    expect(remainingMinutes(lengths, 0, 0)).toBe(20)
  })

  test('讀到一半剩下一半', () => {
    expect(remainingMinutes(lengths, 1, 0)).toBe(10)
  })

  test('讀完是 0', () => {
    expect(remainingMinutes(lengths, 1, 1)).toBe(0)
  })

  test('不到一分鐘進位為 1 分鐘', () => {
    expect(remainingMinutes([100], 0, 0)).toBe(1)
  })

  test('沒有字數資料時回傳 null', () => {
    expect(remainingMinutes([], 0, 0)).toBeNull()
  })
})
