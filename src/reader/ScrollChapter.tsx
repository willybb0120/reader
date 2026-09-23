import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { useChapterContent } from './useChapterContent'
import { charOffsetAtScrollTop, scrollTopForCharOffset, scrollTopForElement } from './pageMetrics'
import { plainText } from './textRange'
import { clampScrollTop } from './scroll'

export function ScrollChapter({
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

  useChapterContent({
    contentRef,
    chapter,
    annotations,
    highlightRange,
    speakingRange,
    onSelect,
    onNavigate,
    onAnnotationClick,
  })

  /** 依 entry 停到該停的位置 */
  const settle = useCallback((target: Entry) => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    // 分頁模式會把欄寬寫成行內樣式，切到滾動模式必須清掉
    content.style.height = ''
    content.style.width = ''
    content.style.columnWidth = ''
    content.style.columnGap = ''

    let top = 0
    if (target.kind === 'last') top = viewport.scrollHeight
    else if (target.kind === 'offset') top = scrollTopForCharOffset(content, target.offset)
    else if (target.kind === 'fragment' || target.kind === 'annotation') {
      const selector =
        target.kind === 'fragment'
          ? `#${CSS.escape(target.id)}`
          : `mark[data-annotation="${target.id}"]`
      const element = content.querySelector(selector)
      top = element ? scrollTopForElement(content, element) : 0
    }
    viewport.scrollTop = clampScrollTop(top, viewport.clientHeight, viewport.scrollHeight)
  }, [])

  useLayoutEffect(() => {
    settle(entry)
  }, [chapter.html, annotations, highlightRange, entry, layoutKey, settle])

  // 回報目前位置供進度記錄。滾動事件很密集，用 rAF 收斂成每幀一次。
  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    let frame = 0
    const report = () => {
      frame = 0
      onPositionChange(charOffsetAtScrollTop(content, viewport.scrollTop), plainText(content).length)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }

    report()
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [chapter.index, layoutKey, onPositionChange])

  // 章尾銜接在 Task 6 接上，PagerApi 在 Task 7 接上
  void pagerRef
  void onPastEnd
  void onPastStart
  void onUserTurn

  return (
    <div className="pager pager--scroll" ref={viewportRef}>
      <div className="chapter" ref={contentRef} lang="zh-TW" />
    </div>
  )
}
