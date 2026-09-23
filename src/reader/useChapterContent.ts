import { useEffect, useLayoutEffect } from 'react'
import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'
import type { TextSelection } from './chapterTypes'
import { getTextOffsets, wrapRange } from './textRange'

export interface ChapterContentOptions {
  contentRef: React.RefObject<HTMLElement | null>
  chapter: Chapter
  annotations: Annotation[]
  highlightRange?: { start: number; end: number }
  speakingRange?: { start: number; end: number }
  onSelect: (selection: TextSelection | null) => void
  onNavigate: (chapterIndex: number, fragment?: string) => void
  onAnnotationClick: (id: string, rect: DOMRect) => void
}

/**
 * 章節內容本身的處理：寫入 HTML、包標註、朗讀高亮、選字與內部連結。
 * 這些和版面（分頁或滾動）無關，兩種模式共用。
 */
export function useChapterContent({
  contentRef,
  chapter,
  annotations,
  highlightRange,
  speakingRange,
  onSelect,
  onNavigate,
  onAnnotationClick,
}: ChapterContentOptions): void {
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
  }, [contentRef, chapter.html, annotations, highlightRange])

  // 朗讀高亮單獨處理：重設 innerHTML 會觸發重新排版，每念一句都重排太浪費
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
  }, [contentRef, speakingRange, chapter.html, annotations, highlightRange])

  // 內部連結與標註的點擊。翻頁的點擊由分頁元件自己處理。
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      const anchor = target.closest('a[data-chapter]')
      if (anchor) {
        event.preventDefault()
        event.stopPropagation()
        onNavigate(
          Number(anchor.getAttribute('data-chapter')),
          anchor.getAttribute('data-fragment') ?? undefined,
        )
        return
      }

      const mark = target.closest<HTMLElement>('mark[data-annotation]')
      if (mark) {
        event.stopPropagation()
        onAnnotationClick(mark.dataset.annotation!, mark.getBoundingClientRect())
      }
    }

    content.addEventListener('click', onClick)
    return () => content.removeEventListener('click', onClick)
  }, [contentRef, onNavigate, onAnnotationClick])

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
  }, [contentRef, onSelect])
}
