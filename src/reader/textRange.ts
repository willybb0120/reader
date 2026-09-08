/**
 * 以「章節純文字的字元位移」當作標註定位單位。
 * 字級、行高、欄寬改變都不會影響它，只要章節內容本身不變就永遠對得上。
 */

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

export function plainText(root: Node): string {
  return textNodes(root)
    .map((node) => node.data)
    .join('')
}

interface Position {
  node: Text
  offset: number
}

function locate(nodes: Text[], target: number): Position | null {
  let consumed = 0
  for (const node of nodes) {
    if (target <= consumed + node.data.length) {
      return { node, offset: target - consumed }
    }
    consumed += node.data.length
  }
  const last = nodes.at(-1)
  return last ? { node: last, offset: last.data.length } : null
}

/** 以字元位移建立 Range；沒有文字節點時回傳 null。 */
export function createRange(root: Node, start: number, end: number): Range | null {
  const nodes = textNodes(root)
  if (nodes.length === 0) return null

  const from = locate(nodes, Math.max(0, start))
  const to = locate(nodes, Math.max(0, end))
  if (!from || !to) return null

  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

/**
 * 把 Range 換算回字元位移。
 * 量測「從根節點開頭到邊界點」的文字長度，因此邊界落在元素節點上也算得出來。
 */
export function getTextOffsets(root: Node, range: Range): { start: number; end: number } {
  const measure = (container: Node, offset: number): number => {
    const probe = document.createRange()
    probe.setStart(root, 0)
    probe.setEnd(container, offset)
    return probe.toString().length
  }

  return {
    start: measure(range.startContainer, range.startOffset),
    end: measure(range.endContainer, range.endOffset),
  }
}

/**
 * 把指定位移範圍內的文字包進 <mark>。
 * 逐個文字節點分別包裝，因此跨段落也能正確標示；文字內容不變，位移仍然有效。
 */
export function wrapRange(
  root: Node,
  start: number,
  end: number,
  dataset: Record<string, string>,
): HTMLElement[] {
  const marks: HTMLElement[] = []
  let consumed = 0

  for (const node of textNodes(root)) {
    const nodeStart = consumed
    const nodeEnd = consumed + node.data.length
    consumed = nodeEnd

    const from = Math.max(start, nodeStart)
    const to = Math.min(end, nodeEnd)
    if (from >= to) continue
    if (node.parentElement?.tagName === 'MARK') continue

    const middle = node.splitText(from - nodeStart)
    middle.splitText(to - from)

    const mark = document.createElement('mark')
    Object.assign(mark.dataset, dataset)
    middle.replaceWith(mark)
    mark.appendChild(middle)
    marks.push(mark)
  }

  return marks
}
