import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { getTextOffsets, plainText, wrapRange } from './textRange'
import { pageCount, translateForPage, type PageLayout } from './pagination'
import { applyLayout, charOffsetAtPage, pageForCharOffset, readLayout } from './pageMetrics'

const EMPTY_LAYOUT: PageLayout = { pageWidth: 0, gap: 0 }

function elementPage(content: HTMLElement, element: Element, layout: PageLayout): number {
  const x = element.getBoundingClientRect().left - content.getBoundingClientRect().left
  const stride = layout.pageWidth + layout.gap
  return stride > 0 ? Math.max(0, Math.floor(x / stride)) : 0
}

export function ChapterView({
  chapter,
  annotations,
  entry,
  layoutKey,
  highlightRange,
  speakingRange,
  pagerRef,
  onNavigate,
  onSelect,
  onAnnotationClick,
  onPastEnd,
  onPastStart,
  onPositionChange,
  onUserTurn,
}: ChapterViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<PageLayout>(EMPTY_LAYOUT)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(0)
  const [animate, setAnimate] = useState(false)
  /** 換章時的入場位移：先把新章擺在相鄰的一頁外，再滑到定位 */
  const [enterOffset, setEnterOffset] = useState(0)
  const pageRef = useRef(0)
  const layoutRef = useRef(EMPTY_LAYOUT)
  pageRef.current = page
  layoutRef.current = layout

  // 內容與標註直接寫進 DOM：標註是包在文字上的 <mark>，交給 React 管理反而更複雜
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    content.innerHTML = chapter.html
    for (const annotation of annotations) {
      wrapRange(content, annotation.start, annotation.end, {
        annotation: annotation.id,
        color: annotation.color,
      })
    }
    if (highlightRange) {
      wrapRange(content, highlightRange.start, highlightRange.end, { searchHit: 'true' })
    }
  }, [chapter.html, annotations, highlightRange])

  // 朗讀高亮單獨處理：重設 innerHTML 會觸發重新分頁，每念一句都重排太浪費
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    for (const mark of content.querySelectorAll('mark[data-speaking]')) {
      const parent = mark.parentNode
      if (!parent) continue
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      mark.remove()
      parent.normalize()
    }
    if (speakingRange) {
      wrapRange(content, speakingRange.start, speakingRange.end, { speaking: 'true' })
    }
  }, [speakingRange, chapter.html, annotations, highlightRange])

  /** 重新量測分頁，並停在 target 指定的位置 */
  const relayout = useCallback((target: Entry) => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const measured = readLayout(viewport)
    applyLayout(viewport, content, measured)
    const total = pageCount(content.scrollWidth, measured)
    setLayout(measured)
    setPages(total)

    let next = 0
    if (target.kind === 'last') next = total - 1
    else if (target.kind === 'offset') next = pageForCharOffset(content, target.offset, measured)
    else if (target.kind === 'fragment' || target.kind === 'annotation') {
      const selector =
        target.kind === 'fragment'
          ? `#${CSS.escape(target.id)}`
          : `mark[data-annotation="${target.id}"]`
      const element = content.querySelector(selector)
      next = element ? elementPage(content, element, measured) : 0
    }
    setAnimate(false)
    setEnterOffset(
      target.slide === 'forward'
        ? measured.pageWidth + measured.gap
        : target.slide === 'backward'
          ? -(measured.pageWidth + measured.gap)
          : 0,
    )
    setPage(Math.min(Math.max(0, next), total - 1))
  }, [])

  // 換章、標註變動、改排版設定都要重新分頁
  useLayoutEffect(() => {
    relayout(entry)
  }, [chapter.html, annotations, highlightRange, entry, layoutKey, relayout])

  // 視窗大小改變時維持在原本讀到的位置
  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const observer = new ResizeObserver(() => {
      const offset = charOffsetAtPage(content, pageRef.current, layoutRef.current)
      relayout({ kind: 'offset', offset })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [relayout])

  // 回報目前位置供進度記錄
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    onPositionChange(charOffsetAtPage(content, page, layoutRef.current), plainText(content).length)
  }, [page, pages, chapter.index, onPositionChange])

  const turn = useCallback(
    (delta: number) => {
      const next = pageRef.current + delta
      if (next < 0) onPastStart()
      else if (next >= pages) onPastEnd()
      else {
        setAnimate(true)
        setEnterOffset(0)
        setPage(next)
        const content = contentRef.current
        if (content && onUserTurn) {
          onUserTurn(charOffsetAtPage(content, next, layoutRef.current))
        }
      }
    },
    [pages, onPastEnd, onPastStart, onUserTurn],
  )

  // 先畫出入場位置，下一幀才打開動畫並滑到定位
  useEffect(() => {
    if (animate) return
    const frame = requestAnimationFrame(() => {
      setAnimate(true)
      setEnterOffset(0)
    })
    return () => cancelAnimationFrame(frame)
  }, [animate])

  /** 讓朗讀把畫面翻到指定位置；已經在同一頁就不動 */
  const reveal = useCallback((offset: number) => {
    const content = contentRef.current
    if (!content) return
    const target = pageForCharOffset(content, offset, layoutRef.current)
    if (target === pageRef.current) return
    setAnimate(true)
    setEnterOffset(0)
    setPage(target)
  }, [])

  useEffect(() => {
    pagerRef.current = { turn, reveal }
    return () => {
      pagerRef.current = null
    }
  }, [pagerRef, turn, reveal])

  // 點擊翻頁：右側 2/3 往下、左側 1/3 往回
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      const anchor = target.closest('a[data-chapter]')
      if (anchor) {
        event.preventDefault()
        onNavigate(
          Number(anchor.getAttribute('data-chapter')),
          anchor.getAttribute('data-fragment') ?? undefined,
        )
        return
      }

      const mark = target.closest<HTMLElement>('mark[data-annotation]')
      if (mark) {
        onAnnotationClick(mark.dataset.annotation!, mark.getBoundingClientRect())
        return
      }

      // 正在選字時不翻頁，否則想劃線就會跳頁
      if (!window.getSelection()?.isCollapsed) return

      const { left, width } = viewport.getBoundingClientRect()
      turn(event.clientX - left < width / 3 ? -1 : 1)
    }

    viewport.addEventListener('click', onClick)
    return () => viewport.removeEventListener('click', onClick)
  }, [turn, onNavigate, onAnnotationClick])

  // 手機左右滑動翻頁
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let startX = 0
    let startY = 0

    const onStart = (event: TouchEvent) => {
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
    }
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return
      turn(dx < 0 ? 1 : -1)
    }

    viewport.addEventListener('touchstart', onStart, { passive: true })
    viewport.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      viewport.removeEventListener('touchstart', onStart)
      viewport.removeEventListener('touchend', onEnd)
    }
  }, [turn])

  // 選取文字後浮出標註工具列
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const onSelectionEnd = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        onSelect(null)
        return
      }
      const range = selection.getRangeAt(0)
      const text = range.toString().trim()
      if (!content.contains(range.commonAncestorContainer) || !text) {
        onSelect(null)
        return
      }
      const { start, end } = getTextOffsets(content, range)
      onSelect({ start, end, text, rect: range.getBoundingClientRect() })
    }

    document.addEventListener('mouseup', onSelectionEnd)
    document.addEventListener('touchend', onSelectionEnd)
    return () => {
      document.removeEventListener('mouseup', onSelectionEnd)
      document.removeEventListener('touchend', onSelectionEnd)
    }
  }, [onSelect])

  return (
    <div className="pager" ref={viewportRef} data-pages={pages} data-page={page}>
      <div
        className="chapter"
        ref={contentRef}
        lang="zh-TW"
        data-animate={animate}
        style={{ transform: `translateX(${enterOffset - translateForPage(page, layout)}px)` }}
      />
    </div>
  )
}
