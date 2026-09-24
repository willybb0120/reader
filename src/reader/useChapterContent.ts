import { useEffect, useLayoutEffect } from 'react'
import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'
import type { TextSelection } from './chapterTypes'
import { getTextOffsets, wrapRange } from './textRange'

/**
 * selectionchange 的 debounce 間隔。拖曳選取控點時每個微小變動都會觸發 selectionchange，
 * 不 debounce 會每次都重算文字位移；180ms 短到使用者感覺不出延遲，又足以吃掉拖曳中的抖動。
 */
const SELECTION_DEBOUNCE_MS = 180

export interface ChapterContentOptions {
  contentRef: React.RefObject<HTMLElement | null>
  chapter: Chapter
  annotations: Annotation[]
  highlightRange?: { start: number; end: number }
  speakingRange?: { start: number; end: number }
  onSelect: (selection: TextSelection | null) => void
  onNavigate: (chapterIndex: number, fragment?: string) => void
  onAnnotationClick: (id: string) => void
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
        onAnnotationClick(mark.dataset.annotation!)
      }
    }

    content.addEventListener('click', onClick)
    return () => content.removeEventListener('click', onClick)
  }, [contentRef, onNavigate, onAnnotationClick])

  // 選取文字後浮出標註工具列。
  // 手機原生選字不保證送出 mouseup/touchend（長按由瀏覽器接管手勢，拖曳選取控點是原生 UI），
  // 所以改以 selectionchange 為主，涵蓋所有選取變化的路徑；pointerup 只用來讓滑鼠／點按放開時
  // 立即評估一次，不必等 debounce，維持桌機的即時手感。
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const evaluate = () => {
      debounceTimer = undefined
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
      onSelect({ start, end, text })
    }

    const onSelectionChange = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(evaluate, SELECTION_DEBOUNCE_MS)
    }

    // 指標放開時立即評估一次，不等 debounce：桌機滑鼠選字才不會有延遲感
    const onPointerUp = () => {
      clearTimeout(debounceTimer)
      evaluate()
    }

    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('pointerup', onPointerUp)
    // iOS 長按選字手勢被系統取消時常送 touchcancel 而非 touchend；
    // selectionchange 理論上已涵蓋最終狀態，這裡補上是為了同樣立即評估，不留延遲
    document.addEventListener('touchcancel', onPointerUp)
    return () => {
      clearTimeout(debounceTimer)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('touchcancel', onPointerUp)
    }
  }, [contentRef, onSelect])
}
