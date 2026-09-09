import { describe, expect, test } from 'vitest'
import { pageCount, pageForOffset, translateForPage } from './pagination'

// 一頁 500px、欄距 40px：第 0 頁起點 0、第 1 頁起點 540、第 2 頁起點 1080
const layout = { pageWidth: 500, gap: 40 }

describe('pageCount', () => {
  test('內容剛好一頁', () => {
    expect(pageCount(500, layout)).toBe(1)
  })

  test('內容三頁（總寬含兩個欄距）', () => {
    expect(pageCount(1580, layout)).toBe(3)
  })

  test('多出零頭仍算一整頁', () => {
    expect(pageCount(560, layout)).toBe(2)
  })

  test('沒有內容時至少一頁', () => {
    expect(pageCount(0, layout)).toBe(1)
  })

  test('頁寬為 0 時不會除以零', () => {
    expect(pageCount(1000, { pageWidth: 0, gap: 40 })).toBe(1)
  })
})

describe('translateForPage', () => {
  test('第一頁不位移', () => {
    expect(translateForPage(0, layout)).toBe(0)
  })

  test('每頁位移一個頁寬加欄距', () => {
    expect(translateForPage(2, layout)).toBe(1080)
  })
})

describe('pageForOffset', () => {
  test('落在第一欄內', () => {
    expect(pageForOffset(120, layout)).toBe(0)
  })

  test('落在第二欄內', () => {
    expect(pageForOffset(600, layout)).toBe(1)
  })

  test('剛好在欄距上時算下一頁', () => {
    expect(pageForOffset(520, layout)).toBe(1)
  })

  test('負值夾到第一頁', () => {
    expect(pageForOffset(-30, layout)).toBe(0)
  })
})
