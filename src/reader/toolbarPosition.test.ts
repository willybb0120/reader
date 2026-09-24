import { describe, expect, test } from 'vitest'
import { computeToolbarPosition, isFullyOutOfView, pickVisibleRect } from './toolbarPosition'

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

describe('上下翻面的遲滯帶（fix round 1 / Finding 3）', () => {
  const at = (top: number, prevAbove: boolean | null) =>
    computeToolbarPosition({ top, bottom: top + 30, left: 100, right: 200, width: 100 }, 400, 800, prevAbove)

  test('沒有上一次方向時（第一次量測），用原本的門檻直接判斷', () => {
    expect(at(100, null)?.above).toBe(true)
    expect(at(90, null)?.above).toBe(false)
  })

  test('原本在上方，rect.top 落在遲滯帶內就不翻面', () => {
    // 門檻 96、遲滯帶 24：上方要掉到 72 以下才會翻到下方，90 還在帶內
    expect(at(90, true)?.above).toBe(true)
  })

  test('原本在上方，跨過遲滯帶下緣才真的翻到下方', () => {
    expect(at(70, true)?.above).toBe(false)
  })

  test('原本在下方，rect.top 落在遲滯帶內就不翻回上方', () => {
    // 上方要升到 120 以上才會翻回去，110 還在帶內
    expect(at(110, false)?.above).toBe(false)
  })

  test('原本在下方，跨過遲滯帶上緣才真的翻回上方', () => {
    expect(at(125, false)?.above).toBe(true)
  })

  test('連續捲動來回經過門檻附近時不應該反覆翻面', () => {
    let above: boolean | null = null
    const walk = (top: number) => {
      const pos = at(top, above)
      above = pos ? pos.above : null
      return above
    }
    expect(walk(200)).toBe(true)
    expect(walk(90)).toBe(true) // 遲滯帶內，沿用 above
    expect(walk(70)).toBe(false) // 跨過下緣，翻到 below
    expect(walk(110)).toBe(false) // 遲滯帶內，沿用 below，不會又翻回去
    expect(walk(125)).toBe(true) // 跨過上緣，翻回 above
  })
})

describe('多片段標註挑選代表 rect（fix round 1 / Finding 2）', () => {
  test('沒有任何片段回傳 null', () => {
    expect(pickVisibleRect([], 800)).toBeNull()
  })

  test('只有一個片段，就是它', () => {
    const rect = { top: 100, bottom: 130 }
    expect(pickVisibleRect([rect], 800)).toBe(rect)
  })

  test('第一個片段捲出畫面上緣，選目前看得到的那個', () => {
    const gone = { top: -400, bottom: -370 }
    const visible = { top: 200, bottom: 230 }
    expect(pickVisibleRect([gone, visible], 800)).toBe(visible)
  })

  test('第一個片段捲出畫面下緣，選目前看得到的那個', () => {
    const visible = { top: 100, bottom: 130 }
    const gone = { top: 900, bottom: 930 }
    expect(pickVisibleRect([visible, gone], 800)).toBe(visible)
  })

  test('全部片段都不在可視範圍內，選離可視範圍最近的那個', () => {
    const farAbove = { top: -500, bottom: -470 }
    const nearAbove = { top: -50, bottom: -20 }
    const farBelow = { top: 1200, bottom: 1230 }
    expect(pickVisibleRect([farAbove, nearAbove, farBelow], 800)).toBe(nearAbove)
  })

  test('部分片段在可視範圍內，即使不是陣列中第一個也要選到', () => {
    const gone1 = { top: -900, bottom: -870 }
    const gone2 = { top: -500, bottom: -470 }
    const visible = { top: 50, bottom: 80 }
    expect(pickVisibleRect([gone1, gone2, visible], 800)).toBe(visible)
  })
})
