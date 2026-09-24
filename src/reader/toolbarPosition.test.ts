import { describe, expect, test } from 'vitest'
import { computeToolbarPosition, isFullyOutOfView } from './toolbarPosition'

describe('是否完全捲出可視範圍', () => {
  test('rect 底部在視窗上緣以上，算已捲出', () => {
    expect(isFullyOutOfView({ top: -60, bottom: -10, left: 20, right: 120, width: 100 }, 400, 800)).toBe(true)
  })

  test('rect 頂部在視窗下緣以下，算已捲出', () => {
    expect(isFullyOutOfView({ top: 820, bottom: 860, left: 20, right: 120, width: 100 }, 400, 800)).toBe(true)
  })

  test('左右方向完全捲出也算', () => {
    expect(isFullyOutOfView({ top: 100, bottom: 140, left: -200, right: -100, width: 100 }, 400, 800)).toBe(true)
    expect(isFullyOutOfView({ top: 100, bottom: 140, left: 500, right: 600, width: 100 }, 400, 800)).toBe(true)
  })

  test('部分或完全在可視範圍內就不算', () => {
    expect(isFullyOutOfView({ top: 100, bottom: 140, left: 20, right: 120, width: 100 }, 400, 800)).toBe(false)
    expect(isFullyOutOfView({ top: -10, bottom: 10, left: 20, right: 120, width: 100 }, 400, 800)).toBe(false)
  })
})

describe('工具列位置計算', () => {
  test('完全捲出可視範圍回傳 null，交給呼叫端隱藏', () => {
    expect(computeToolbarPosition({ top: -60, bottom: -10, left: 20, right: 120, width: 100 }, 400, 800)).toBeNull()
  })

  test('選取範圍夠低時浮在上方', () => {
    const pos = computeToolbarPosition({ top: 300, bottom: 330, left: 100, right: 200, width: 100 }, 400, 800)
    expect(pos).toEqual({ top: 288, left: 150, above: true })
  })

  test('太靠近視窗頂端時改浮在下方', () => {
    const pos = computeToolbarPosition({ top: 20, bottom: 50, left: 100, right: 200, width: 100 }, 400, 800)
    expect(pos?.above).toBe(false)
    expect(pos?.top).toBe(62)
  })

  test('捲動時 top 位移量與 rect 位移量相同（線性跟隨，不是每次都重算門檻）', () => {
    const a = computeToolbarPosition({ top: 500, bottom: 530, left: 100, right: 200, width: 100 }, 400, 800)
    const b = computeToolbarPosition({ top: 200, bottom: 230, left: 100, right: 200, width: 100 }, 400, 800)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect((a!.top) - (b!.top)).toBe(300)
  })

  test('左右夾在視窗內，不會貼齊邊緣', () => {
    const left = computeToolbarPosition({ top: 300, bottom: 330, left: -50, right: 20, width: 70 }, 400, 800)
    expect(left?.left).toBe(140)
    const right = computeToolbarPosition({ top: 300, bottom: 330, left: 380, right: 450, width: 70 }, 400, 800)
    expect(right?.left).toBe(260)
  })

  test('太靠近視窗底部時夾住，不會被推出畫面', () => {
    const pos = computeToolbarPosition({ top: 790, bottom: 810, left: 100, right: 200, width: 100 }, 400, 800)
    expect(pos?.top).toBe(776)
  })
})
