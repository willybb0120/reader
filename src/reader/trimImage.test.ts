import { describe, expect, test } from 'vitest'
import { findContentBounds, isLineArtOnWhite } from './trimImage'

/** 產生 RGBA 像素陣列；filled 決定哪些座標是前景（黑色）。 */
function pixels(
  width: number,
  height: number,
  isForeground: (x: number, y: number) => boolean,
  background: [number, number, number] = [255, 255, 255],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b] = isForeground(x, y) ? [0, 0, 0] : background
      data.set([r, g, b, 255], i)
    }
  }
  return data
}

describe('findContentBounds', () => {
  test('找出白底中央方塊的邊界', () => {
    const data = pixels(10, 10, (x, y) => x >= 3 && x <= 5 && y >= 2 && y <= 7)

    expect(findContentBounds(data, 10, 10)).toEqual({ left: 3, top: 2, right: 5, bottom: 7 })
  })

  test('內容貼齊左緣時邊界從 0 開始', () => {
    const data = pixels(10, 10, (x, y) => x <= 4 && y >= 3 && y <= 6)

    expect(findContentBounds(data, 10, 10)).toEqual({ left: 0, top: 3, right: 4, bottom: 6 })
  })

  test('單一顏色的圖片沒有內容邊界', () => {
    expect(findContentBounds(pixels(6, 6, () => false), 6, 6)).toBeNull()
    expect(findContentBounds(pixels(6, 6, () => true), 6, 6)).toBeNull()
  })

  test('底色不是白色時以四角顏色為準', () => {
    const data = pixels(8, 8, (x, y) => x === 4 && y === 4, [20, 30, 40])

    expect(findContentBounds(data, 8, 8)).toEqual({ left: 4, top: 4, right: 4, bottom: 4 })
  })

  test('忽略與底色差異極小的雜訊', () => {
    const data = pixels(8, 8, () => false)
    // 在 (1,1) 放一個幾乎等於白色的像素
    data.set([250, 250, 250, 255], (1 * 8 + 1) * 4)

    expect(findContentBounds(data, 8, 8)).toBeNull()
  })

  test('透明像素視為背景', () => {
    const data = pixels(8, 8, (x, y) => x === 2 && y === 2)
    // 讓 (5,5) 完全透明但帶黑色
    data.set([0, 0, 0, 0], (5 * 8 + 5) * 4)

    expect(findContentBounds(data, 8, 8)).toEqual({ left: 2, top: 2, right: 2, bottom: 2 })
  })
})

describe('isLineArtOnWhite', () => {
  test('白底黑線的裝飾圖判定為線稿', () => {
    const data = pixels(20, 20, (x, y) => x === y && x > 2 && x < 17)

    expect(isLineArtOnWhite(data, 20, 20)).toBe(true)
  })

  test('彩色圖片不是線稿', () => {
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let i = 0; i < data.length; i += 4) data.set([250, 250, 250, 255], i)
    for (let i = 0; i < 200 * 4; i += 4) data.set([200, 40, 40, 255], i + 20 * 4)

    expect(isLineArtOnWhite(data, 20, 20)).toBe(false)
  })

  test('深色底的圖片不是白底線稿', () => {
    const data = pixels(20, 20, (x, y) => x === y && x > 2 && x < 17, [30, 30, 30])

    expect(isLineArtOnWhite(data, 20, 20)).toBe(false)
  })
})
