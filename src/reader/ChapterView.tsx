import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'
import { getTextOffsets, wrapRange } from './textRange'

export interface TextSelection {
  start: number
  end: number
  text: string
  rect: DOMRect
}

interface ChapterViewProps {
  chapter: Chapter
  annotations: Annotation[]
  /** 章內或跨章連結被點擊 */
  onNavigate: (chapterIndex: number, fragment?: string) => void
  /** 使用者選取了一段文字（清除選取時為 null） */
  onSelect: (selection: TextSelection | null) => void
  /** 點到既有的標註 */
  onAnnotationClick: (id: string, rect: DOMRect) => void
  /** 進入章節後要捲到的錨點 */
  scrollToFragment?: string
  /** 進入章節後要還原的捲動比例（0-1） */
  initialScrollRatio?: number
  /** 進入章節後要捲到的標註 */
  focusAnnotationId?: string
}

export function ChapterView({
  chapter,
  annotations,
  onNavigate,
  onSelect,
  onAnnotationClick,
  scrollToFragment,
  initialScrollRatio = 0,
  focusAnnotationId,
}: ChapterViewProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 內容與標註都直接寫入 DOM：標註是包在文字上的 <mark>，交給 React 管理反而更複雜
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    container.innerHTML = chapter.html
    for (const annotation of annotations) {
      wrapRange(container, annotation.start, annotation.end, annotation.id, annotation.color)
    }
  }, [chapter.html, annotations])

  useEffect(() => {
    const container = ref.current
    if (!container) return

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
      if (mark) onAnnotationClick(mark.dataset.annotation!, mark.getBoundingClientRect())
    }

    const onSelectionEnd = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        onSelect(null)
        return
      }
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        onSelect(null)
        return
      }
      const text = range.toString().trim()
      if (!text) {
        onSelect(null)
        return
      }
      const { start, end } = getTextOffsets(container, range)
      onSelect({ start, end, text, rect: range.getBoundingClientRect() })
    }

    container.addEventListener('click', onClick)
    document.addEventListener('mouseup', onSelectionEnd)
    document.addEventListener('touchend', onSelectionEnd)
    return () => {
      container.removeEventListener('click', onClick)
      document.removeEventListener('mouseup', onSelectionEnd)
      document.removeEventListener('touchend', onSelectionEnd)
    }
  }, [onNavigate, onSelect, onAnnotationClick])

  useEffect(() => {
    const container = ref.current
    if (!container) return

    if (scrollToFragment) {
      const target = container.querySelector(`#${CSS.escape(scrollToFragment)}`)
      if (target) {
        target.scrollIntoView({ block: 'start' })
        return
      }
    }

    if (initialScrollRatio <= 0) {
      window.scrollTo({ top: 0 })
      return
    }

    // 圖片載入後版面高度才穩定，因此再補套用一次
    const apply = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: scrollable * initialScrollRatio })
    }
    apply()
    const timer = setTimeout(apply, 300)
    return () => clearTimeout(timer)
  }, [chapter.index, scrollToFragment, initialScrollRatio])

  useEffect(() => {
    if (!focusAnnotationId) return
    ref.current
      ?.querySelector(`mark[data-annotation="${focusAnnotationId}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [focusAnnotationId, chapter.index, annotations])

  return <article className="chapter" ref={ref} lang="zh-TW" />
}
