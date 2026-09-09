import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'
import { getTextOffsets, plainText, wrapRange } from './textRange'
import { pageCount, translateForPage, type PageLayout } from './pagination'
import { applyLayout, charOffsetAtPage, pageForCharOffset, readLayout } from './pageMetrics'

export interface TextSelection {
  start: number
  end: number
  text: string
  rect: DOMRect
}

/** 進入章節時要停在哪裡 */
export type EntryTarget =
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'offset'; offset: number }
  | { kind: 'fragment'; id: string }
  | { kind: 'annotation'; id: string }

/**
 * slide 指定新章節要從哪一側滑進來。
 * 換章時頁碼會歸零或跳到章尾，位移量與翻頁方向無關，
 * 所以得另外指定方向，否則動畫會往反方向跑。
 */
export type Entry = EntryTarget & { slide?: 'forward' | 'backward' }

export interface PagerApi {
  turn: (delta: number) => void
}

interface ChapterViewProps {
  chapter: Chapter
  annotations: Annotation[]
  entry: Entry
  /** 排版設定的指紋，改變時重新分頁 */
  layoutKey: string
  /** 搜尋命中的範圍，會另外標示 */
  highlightRange?: { start: number; end: number }
  /** 讓外部（鍵盤快捷鍵）也能翻頁 */
  pagerRef: React.RefObject<PagerApi | null>
  onNavigate: (chapterIndex: number, fragment?: string) => void
  onSelect: (selection: TextSelection | null) => void
  onAnnotationClick: (id: string, rect: DOMRect) => void
  /** 已在最後一頁還要往下翻 */
  onPastEnd: () => void
  /** 已在第一頁還要往回翻 */
  onPastStart: () => void
  /** 目前頁面起始位置改變，回報給進度記錄 */
  onPositionChange: (charOffset: number, chapterLength: number) => void
}

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
  pagerRef,
  onNavigate,
  onSelect,
  onAnnotationClick,
  onPastEnd,
  onPastStart,
  onPositionChange,
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
        setPage(next)
      }
    },
    [pages, onPastEnd, onPastStart],
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

  useEffect(() => {
    pagerRef.current = { turn }
    return () => {
      pagerRef.current = null
    }
  }, [pagerRef, turn])

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
