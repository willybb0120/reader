import { unzipSync, strFromU8 } from 'fflate'
import { sanitizeFragment } from './sanitize'

export class EpubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EpubError'
  }
}

export interface BookMetadata {
  title: string
  creator: string
  language: string
  identifier: string
}

export interface SpineItem {
  id: string
  href: string
}

export interface NavItem {
  label: string
  chapterIndex: number
  fragment: string | undefined
  children: NavItem[]
}

export interface Chapter {
  index: number
  title: string
  html: string
}

export interface Book {
  metadata: BookMetadata
  spine: SpineItem[]
  nav: NavItem[]
  coverUrl: string | undefined
  /** 封面原始資料，供書櫃保存 */
  coverImage: { data: ArrayBuffer; type: string } | undefined
  getChapter(index: number): Promise<Chapter>
  /** 章節純文字，位移與渲染後的 HTML 一致，供搜尋與進度估算使用 */
  getChapterText(index: number): Promise<string>
  dispose(): void
}

const XHTML = 'application/xhtml+xml'

/** 以 ZIP 內部路徑語意解析相對路徑（base 為檔案路徑，非目錄）。 */
function resolvePath(base: string, relative: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(relative)) return relative
  const segments = base.split('/').slice(0, -1)
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return segments.join('/')
}

function parseXml(text: string, type: DOMParserSupportedType = XHTML): Document {
  const doc = new DOMParser().parseFromString(text, type)
  if (doc.querySelector('parsererror')) {
    // XHTML 解析失敗時退回較寬鬆的 HTML 解析
    return new DOMParser().parseFromString(text, 'text/html')
  }
  return doc
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  css: 'text/css',
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export async function parseEpub(data: Uint8Array | ArrayBuffer): Promise<Book> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch (cause) {
    throw new EpubError(`無法解壓縮 EPUB：${(cause as Error).message}`)
  }

  const read = (path: string): Uint8Array | undefined => files[path]
  const readText = (path: string): string | undefined => {
    const raw = read(path)
    return raw ? strFromU8(raw) : undefined
  }

  const containerXml = readText('META-INF/container.xml')
  if (!containerXml) throw new EpubError('EPUB 缺少 META-INF/container.xml')

  const container = parseXml(containerXml, 'text/xml')
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new EpubError('container.xml 未指定 OPF 路徑')

  const opfXml = readText(opfPath)
  if (!opfXml) throw new EpubError(`找不到 OPF 檔案：${opfPath}`)
  const opf = parseXml(opfXml, 'text/xml')

  const metadataEl = opf.querySelector('metadata')
  const text = (name: string): string => {
    const el = [...(metadataEl?.children ?? [])].find(
      (child) => child.localName.toLowerCase() === name || child.tagName.toLowerCase() === `dc:${name}`,
    )
    return el?.textContent?.trim() ?? ''
  }

  const metadata: BookMetadata = {
    title: text('title') || '未命名',
    creator: text('creator'),
    language: text('language'),
    identifier: text('identifier'),
  }

  // manifest：id → { href（ZIP 絕對路徑）, properties }
  const manifest = new Map<string, { href: string; properties: string }>()
  for (const item of opf.querySelectorAll('manifest item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      href: resolvePath(opfPath, decodeURIComponent(href)),
      properties: item.getAttribute('properties') ?? '',
    })
  }

  const spine: SpineItem[] = []
  for (const ref of opf.querySelectorAll('spine itemref')) {
    const idref = ref.getAttribute('idref')
    const entry = idref ? manifest.get(idref) : undefined
    if (entry) spine.push({ id: idref!, href: entry.href })
  }
  if (spine.length === 0) throw new EpubError('EPUB 的 spine 沒有任何章節')

  const chapterIndexByPath = new Map(spine.map((item, index) => [item.href, index]))

  // 資源 blob URL 快取
  const blobUrls = new Map<string, string>()
  const blobUrlFor = (path: string): string | undefined => {
    const cached = blobUrls.get(path)
    if (cached) return cached
    const raw = read(path)
    if (!raw) return undefined
    const url = URL.createObjectURL(
      new Blob([raw.slice().buffer as ArrayBuffer], { type: mimeFor(path) }),
    )
    blobUrls.set(path, url)
    return url
  }

  const coverPath =
    [...manifest.values()].find((item) => item.properties.includes('cover-image'))?.href ??
    manifest.get(opf.querySelector('metadata meta[name="cover"]')?.getAttribute('content') ?? '')
      ?.href
  const coverUrl = coverPath ? blobUrlFor(coverPath) : undefined
  const coverBytes = coverPath ? read(coverPath) : undefined
  const coverImage = coverBytes
    ? { data: coverBytes.slice().buffer as ArrayBuffer, type: mimeFor(coverPath!) }
    : undefined

  const nav = buildNav()

  function buildNav(): NavItem[] {
    const navPath = [...manifest.values()].find((item) =>
      item.properties.split(/\s+/).includes('nav'),
    )?.href
    const fromNav = navPath ? navFromXhtml(navPath) : []
    if (fromNav.length > 0) return fromNav

    const ncxPath = [...manifest.values()].find((item) => item.href.endsWith('.ncx'))?.href
    return ncxPath ? navFromNcx(ncxPath) : []
  }

  function toNavItem(href: string, label: string, basePath: string): NavItem | undefined {
    const [rawPath, fragment] = decodeURIComponent(href).split('#')
    const target = resolvePath(basePath, rawPath)
    const chapterIndex = chapterIndexByPath.get(target)
    if (chapterIndex === undefined) return undefined
    return { label, chapterIndex, fragment: fragment || undefined, children: [] }
  }

  function navFromXhtml(navPath: string): NavItem[] {
    const doc = parseXml(readText(navPath) ?? '')
    const navs = [...doc.querySelectorAll('nav')]
    const toc =
      navs.find((el) => (el.getAttribute('epub:type') ?? el.getAttribute('type')) === 'toc') ??
      navs[0]
    const rootList = toc?.querySelector('ol')
    return rootList ? walkList(rootList, navPath) : []
  }

  function walkList(list: Element, basePath: string): NavItem[] {
    const items: NavItem[] = []
    for (const li of list.children) {
      if (li.tagName.toLowerCase() !== 'li') continue
      const anchor = li.querySelector(':scope > a, :scope > span > a')
      const href = anchor?.getAttribute('href')
      const label = anchor?.textContent?.trim() ?? ''
      const childList = li.querySelector(':scope > ol')
      const children = childList ? walkList(childList, basePath) : []
      if (!href) {
        items.push(...children)
        continue
      }
      const item = toNavItem(href, label, basePath)
      if (item) {
        item.children = children
        items.push(item)
      } else {
        items.push(...children)
      }
    }
    return items
  }

  function navFromNcx(ncxPath: string): NavItem[] {
    const doc = parseXml(readText(ncxPath) ?? '', 'text/xml')
    const walk = (parent: Element): NavItem[] => {
      const items: NavItem[] = []
      for (const point of parent.children) {
        if (point.tagName.toLowerCase() !== 'navpoint') continue
        const href = point.querySelector(':scope > content')?.getAttribute('src')
        const label = point.querySelector(':scope > navLabel > text')?.textContent?.trim() ?? ''
        const children = walk(point)
        const item = href ? toNavItem(href, label, ncxPath) : undefined
        if (item) {
          item.children = children
          items.push(item)
        } else {
          items.push(...children)
        }
      }
      return items
    }
    const navMap = doc.querySelector('navMap')
    return navMap ? walk(navMap) : []
  }

  const chapterCache = new Map<number, Chapter>()

  function renderChapter(index: number): Chapter {
    const item = spine[index]
    if (!item) throw new EpubError(`章節索引超出範圍：${index}`)

    const doc = parseXml(readText(item.href) ?? '<html><body></body></html>')
    const body = doc.body ?? doc.documentElement

    // calibre 常以 <svg><image xlink:href>包整頁圖，攤平成 <img> 才能在捲動版面正常呈現
    for (const svg of body.querySelectorAll('svg')) {
      const images = svg.querySelectorAll('image')
      const href = images[0]?.getAttribute('xlink:href') ?? images[0]?.getAttribute('href')
      if (images.length !== 1 || !href) continue
      const img = doc.createElementNS('http://www.w3.org/1999/xhtml', 'img')
      img.setAttribute('src', href)
      img.setAttribute('alt', '')
      svg.replaceWith(img)
    }

    for (const el of body.querySelectorAll('img, image')) {
      const attr = el.tagName.toLowerCase() === 'image' ? 'xlink:href' : 'src'
      const src = el.getAttribute(attr) ?? el.getAttribute('src')
      if (!src) continue
      const url = blobUrlFor(resolvePath(item.href, decodeURIComponent(src)))
      if (url) el.setAttribute('src', url)
      else el.remove()
    }

    for (const anchor of body.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href')!
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        anchor.setAttribute('target', '_blank')
        anchor.setAttribute('rel', 'noreferrer')
        continue
      }
      const [rawPath, fragment] = decodeURIComponent(href).split('#')
      const targetIndex = rawPath
        ? chapterIndexByPath.get(resolvePath(item.href, rawPath))
        : index
      if (targetIndex === undefined) continue
      anchor.setAttribute('data-chapter', String(targetIndex))
      if (fragment) anchor.setAttribute('data-fragment', fragment)
      anchor.setAttribute('href', '#')
    }

    const title =
      body.querySelector('h1, h2, h3')?.textContent?.trim() ||
      doc.querySelector('title')?.textContent?.trim() ||
      `第 ${index + 1} 節`

    const html = sanitizeFragment(body)

    return { index, title, html }
  }

  function chapterAt(index: number): Chapter {
    const cached = chapterCache.get(index)
    if (cached) return cached
    const chapter = renderChapter(index)
    chapterCache.set(index, chapter)
    return chapter
  }

  return {
    metadata,
    spine,
    nav,
    coverUrl,
    coverImage,
    async getChapter(index) {
      return chapterAt(index)
    },
    async getChapterText(index) {
      // 直接取渲染後 HTML 的文字，位移才會與畫面上的標註、搜尋結果對得上
      const container = document.createElement('div')
      container.innerHTML = chapterAt(index).html
      return container.textContent ?? ''
    },
    dispose() {
      for (const url of blobUrls.values()) URL.revokeObjectURL(url)
      blobUrls.clear()
      chapterCache.clear()
    },
  }
}
