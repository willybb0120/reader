import { describe, expect, test } from 'vitest'
import { bookPose, filterBooks, ringLayout, snapTarget, stepSpring, wrapDelta } from './carousel'

describe('wrapDelta', () => {
  test('取圓上最短的帶號距離', () => {
    expect(wrapDelta(1, 10)).toBe(1)
    expect(wrapDelta(9, 10)).toBe(-1)
    expect(wrapDelta(-9, 10)).toBe(1)
    expect(wrapDelta(0.4, 10)).toBeCloseTo(0.4)
  })
  test('只有一本書時距離永遠是 0', () => {
    expect(wrapDelta(3, 1)).toBe(0)
  })
})

describe('ringLayout', () => {
  test('書少時角距有上限，不會散到整圈', () => {
    expect(ringLayout(2, 150).step).toBe(40)
  })
  test('書多時角距有下限，只露出前半圈', () => {
    expect(ringLayout(100, 150).step).toBe(22)
  })
  test('相鄰兩本的弦長大於封面寬，不會互相重疊', () => {
    const { step, radius } = ringLayout(18, 150)
    const chord = 2 * radius * Math.sin((step * Math.PI) / 360)
    expect(chord).toBeGreaterThan(150)
  })
})

describe('bookPose', () => {
  const layout = ringLayout(18, 150)
  test('正前方的書升最高，越遠越低', () => {
    const front = bookPose(0, layout, 220)
    const half = bookPose(0.5, layout, 220)
    const side = bookPose(1, layout, 220)
    expect(front.lift).toBe(1)
    expect(half.lift).toBeGreaterThan(0)
    expect(half.lift).toBeLessThan(1)
    expect(side.lift).toBe(0)
  })
  test('轉到背後的書隱藏', () => {
    expect(bookPose(8, layout, 220).visible).toBe(false)
    expect(bookPose(2, layout, 220).visible).toBe(true)
  })
})

describe('snapTarget', () => {
  test('放手時吸附到最近的一本，速度越快滑越遠', () => {
    expect(snapTarget(2.3, 0)).toBe(2)
    expect(snapTarget(2.3, 10)).toBeGreaterThan(3)
    expect(snapTarget(2.3, -10)).toBeLessThan(1)
  })
  test('再快的甩動也有上限，不會一口氣轉好幾圈', () => {
    expect(snapTarget(0, 10000)).toBe(snapTarget(0, 20))
  })
})

describe('stepSpring', () => {
  test('最後停在目標上', () => {
    let state = { pos: 0, vel: 0 }
    for (let i = 0; i < 200; i++) state = stepSpring(state, 3, 1 / 60)
    expect(state.pos).toBe(3)
    expect(state.vel).toBe(0)
  })
})

describe('filterBooks', () => {
  const books = [
    { title: '創造力的修行', creator: '里克・魯賓' },
    { title: 'The Creative Act', creator: 'Rick Rubin' },
    { title: 'Sapiens', creator: undefined },
  ]
  test('比對書名與作者，不分大小寫與前後空白', () => {
    expect(filterBooks(books, ' rick ').map((b) => b.title)).toEqual(['The Creative Act'])
    expect(filterBooks(books, '修行').map((b) => b.title)).toEqual(['創造力的修行'])
    expect(filterBooks(books, 'SAP').map((b) => b.title)).toEqual(['Sapiens'])
  })
  test('空字串回傳全部', () => {
    expect(filterBooks(books, '  ')).toHaveLength(3)
  })
})
