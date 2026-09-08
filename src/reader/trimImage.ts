export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

/** 每個色版與底色的最大容許差，用來忽略壓縮雜訊。 */
const DEFAULT_TOLERANCE = 12
const ALPHA_THRESHOLD = 16

/**
 * 找出圖片中非底色內容的邊界。底色取自四個角落，全部是底色時回傳 null。
 * 電子書常見的裝飾圖帶有大片留白，裁掉後在捲動版面才不會撐出空洞。
 */
export function findContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = DEFAULT_TOLERANCE,
): Bounds | null {
  const at = (x: number, y: number) => (y * width + x) * 4

  const corners = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ]
  const transparentBackground = corners.every((i) => data[i + 3] < ALPHA_THRESHOLD)
  const background = [0, 1, 2].map(
    (channel) => corners.reduce((sum, i) => sum + data[i + channel], 0) / corners.length,
  )

  const isBackground = (i: number): boolean => {
    if (data[i + 3] < ALPHA_THRESHOLD) return true
    if (transparentBackground) return false
    return (
      Math.abs(data[i] - background[0]) <= tolerance &&
      Math.abs(data[i + 1] - background[1]) <= tolerance &&
      Math.abs(data[i + 2] - background[2]) <= tolerance
    )
  }

  let left = width
  let right = -1
  let top = height
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBackground(at(x, y))) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  return right < 0 ? null : { left, top, right, bottom }
}

/**
 * 判斷圖片是否為「白底單色線稿」——電子書的章節裝飾圖多屬此類。
 * 這類圖可以安全地用混色或反相融入頁面底色。
 */
export function isLineArtOnWhite(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const at = (x: number, y: number) => (y * width + x) * 4
  const cornersLight = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
    .every((i) => data[i + 3] < ALPHA_THRESHOLD || (data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235))
  if (!cornersLight) return false

  // 取樣而非逐點掃描：色偏只要有一小部分就足以判定為彩圖
  const step = Math.max(1, Math.floor((width * height) / 4000)) * 4
  let sampled = 0
  let colored = 0
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < ALPHA_THRESHOLD) continue
    sampled++
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    if (max - min > 24) colored++
  }
  return sampled > 0 && colored / sampled < 0.05
}
