import { describe, expect, test } from 'vitest'
import { atEnd, atStart, clampScrollTop, pullOffset, revealScrollTop, turnScrollTop } from './scroll'

describe('滾動邊界', () => {
  test('頂端允許兩像素誤差', () => {
    expect(atStart(0)).toBe(true)
    expect(atStart(2)).toBe(true)
    expect(atStart(8)).toBe(false)
  })

  test('捲到底時算到章尾', () => {
    expect(atEnd(800, 600, 1400)).toBe(true)
    expect(atEnd(799, 600, 1400)).toBe(true)
    expect(atEnd(700, 600, 1400)).toBe(false)
  })

  test('內容比視窗短時一律算既在頂端也在章尾', () => {
    expect(atStart(0)).toBe(true)
    expect(atEnd(0, 600, 400)).toBe(true)
  })
})

describe('捲動目標', () => {
  test('夾在可捲動範圍內', () => {
    expect(clampScrollTop(-50, 600, 1400)).toBe(0)
    expect(clampScrollTop(9999, 600, 1400)).toBe(800)
    expect(clampScrollTop(300, 600, 1400)).toBe(300)
  })

  test('內容比視窗短時只能停在 0', () => {
    expect(clampScrollTop(300, 600, 400)).toBe(0)
  })

  test('翻一屏會留下重疊，避免被切掉的那行漏讀', () => {
    expect(turnScrollTop(0, 600, 3000, 1)).toBe(552)
    expect(turnScrollTop(552, 600, 3000, -1)).toBe(0)
  })

  test('翻一屏不會超出範圍', () => {
    expect(turnScrollTop(2300, 600, 3000, 1)).toBe(2400)
    expect(turnScrollTop(10, 600, 3000, -1)).toBe(0)
  })
})

describe('朗讀捲動', () => {
  test('句子已經在畫面上就不捲', () => {
    expect(revealScrollTop(700, 600, 600, 3000)).toBe(null)
  })

  test('句子在畫面下方時捲到上方三分之一', () => {
    expect(revealScrollTop(1500, 600, 600, 3000)).toBe(1300)
  })

  test('句子在畫面上方時往回捲', () => {
    expect(revealScrollTop(100, 600, 600, 3000)).toBe(0)
  })

  test('章尾的句子不會捲過頭', () => {
    expect(revealScrollTop(2950, 600, 600, 3000)).toBe(2400)
  })

  test('句子起始在畫面底部邊緣時仍要捲，否則整句都在畫面外', () => {
    expect(revealScrollTop(1150, 600, 600, 3000)).toBe(950)
  })
})

describe('拉曳換章位移', () => {
  test('套用阻尼：原始位移打折', () => {
    expect(pullOffset(100, 0.4, 120)).toBe(40)
    expect(pullOffset(180, 0.4, 120)).toBe(72)
  })

  test('夾上限，避免拉到畫面外', () => {
    expect(pullOffset(500, 0.4, 120)).toBe(120)
  })

  test('反方向（手指往回移動）視為沒有拉曳', () => {
    expect(pullOffset(-50, 0.4, 120)).toBe(0)
    expect(pullOffset(0, 0.4, 120)).toBe(0)
  })
})
