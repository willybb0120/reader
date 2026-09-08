/**
 * 以允許清單清理 EPUB 章節 DOM，回傳可安全注入的 HTML 片段。
 * 自寫而非用 DOMPurify：內容來源固定（EPUB），需求單純，且避免執行環境相容問題。
 */

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
])

const SAFE_URI = /^(?:blob:|data:image\/|https?:|mailto:|#)/i

function cleanElement(el: Element): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase()
    if (name.startsWith('on')) {
      el.removeAttribute(attr.name)
      continue
    }
    if ((name === 'href' || name === 'src') && !SAFE_URI.test(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }
  for (const child of [...el.children]) {
    if (BLOCKED_TAGS.has(child.tagName.toLowerCase())) child.remove()
    else cleanElement(child)
  }
}

export function sanitizeFragment(body: Element): string {
  const clone = body.cloneNode(true) as Element
  cleanElement(clone)

  // 轉入 HTML 文件再序列化，避免 XHTML 序列化在每個標籤加上 xmlns 屬性
  const htmlDoc = document.implementation.createHTMLDocument('')
  const container = htmlDoc.createElement('div')
  for (const child of [...clone.childNodes]) {
    container.appendChild(htmlDoc.importNode(child, true))
  }
  return container.innerHTML
}
