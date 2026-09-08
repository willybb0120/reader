import { findContentBounds, isLineArtOnWhite } from './trimImage'

/** 裁切後至少要省下這個比例的面積才值得替換。 */
const MIN_SAVING = 0.12
/** 小圖多半是符號或圖示，不處理。 */
const MIN_SIZE = 40

interface Processed {
  url: string | null
  lineArt: boolean
}

const cache = new Map<string, Processed>()

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`圖片載入失敗：${src}`))
    image.src = src
  })
}

async function process(src: string): Promise<Processed> {
  const unchanged: Processed = { url: null, lineArt: false }
  const image = await load(src)
  const { naturalWidth: width, naturalHeight: height } = image
  if (width < MIN_SIZE || height < MIN_SIZE) return unchanged

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return unchanged
  context.drawImage(image, 0, 0)

  const { data } = context.getImageData(0, 0, width, height)
  const lineArt = isLineArtOnWhite(data, width, height)
  const bounds = findContentBounds(data, width, height)
  if (!bounds) return { url: null, lineArt }

  const cropWidth = bounds.right - bounds.left + 1
  const cropHeight = bounds.bottom - bounds.top + 1
  if (cropWidth * cropHeight > width * height * (1 - MIN_SAVING)) return { url: null, lineArt }

  const output = document.createElement('canvas')
  output.width = cropWidth
  output.height = cropHeight
  output
    .getContext('2d')
    ?.drawImage(image, bounds.left, bounds.top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'))
  return { url: blob ? URL.createObjectURL(blob) : null, lineArt }
}

function apply(img: HTMLImageElement, result: Processed): void {
  if (result.url) img.src = result.url
  if (result.lineArt) img.dataset.lineArt = 'true'
}

/**
 * 把容器內圖片的單色留白裁掉。原圖若沒有明顯留白則保持不變。
 * 失敗一律忽略——顯示原圖永遠是可接受的結果。
 */
async function trimImagesIn(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll('img')]
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || !src.startsWith('blob:')) return

      const cached = cache.get(src)
      if (cached) {
        apply(img, cached)
        return
      }

      try {
        const result = await process(src)
        cache.set(src, result)
        apply(img, result)
      } catch {
        // 保留原圖
      }
    }),
  )
}

const htmlCache = new Map<string, string>()

/**
 * 在注入畫面前先處理章節 HTML 裡的圖片。
 * 先處理再渲染，重繪時才不會退回未裁切的原圖。
 */
export async function withTrimmedImages(html: string): Promise<string> {
  const cached = htmlCache.get(html)
  if (cached !== undefined) return cached

  const container = document.createElement('div')
  container.innerHTML = html
  if (container.querySelector('img')) {
    await trimImagesIn(container)
  }
  htmlCache.set(html, container.innerHTML)
  return container.innerHTML
}
