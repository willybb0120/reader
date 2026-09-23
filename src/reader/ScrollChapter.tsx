import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { useChapterContent } from './useChapterContent'
import { charOffsetAtScrollTop, scrollTopForCharOffset, scrollTopForElement } from './pageMetrics'
import { plainText } from './textRange'
import { atEnd, atStart, clampScrollTop, revealScrollTop, turnScrollTop } from './scroll'

/** 換章後的冷卻時間，避免慣性滾動一路翻過好幾章 */
const EDGE_COOLDOWN_MS = 600
/** 小於這個滾輪位移視為雜訊，不當成換章意圖 */
const WHEEL_THRESHOLD = 4
/** 觸控要滑動這麼多像素才算一次明確的換章意圖 */
const TOUCH_THRESHOLD = 60
/** 沒有 scrollend 事件的瀏覽器上，程式捲動最多被視為進行中這麼久 */
const PROGRAMMATIC_SCROLL_TIMEOUT_MS = 1200

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
  /** 上次換章的時間，用來擋住慣性滾動連續觸發 */
  const crossedAtRef = useRef(0)
  /** 觸控起點的 Y 座標，effect 重新註冊（換章時 callback 變了）也不能被重設 */
  const startYRef = useRef(0)
  /** 這次觸碰是否已經換過章，避免一次連續觸碰換兩章 */
  const touchCrossedRef = useRef(false)
  /** 程式捲動（翻頁／朗讀跟隨）進行中，捲動事件不該被當成使用者跳讀 */
  const programmaticRef = useRef(false)
  const programmaticTimerRef = useRef(0)

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
    crossedAtRef.current = Date.now()
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
      const offset = charOffsetAtScrollTop(content, viewport.scrollTop)
      onPositionChange(offset, plainText(content).length)
      if (programmaticRef.current) return
      if (onUserTurn) onUserTurn(offset)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }
    // scrollend 在最後一次 scroll 事件之後才發，所以動畫最後一幀的 report()
    // 仍會在旗標為 true 的狀態下跑，不會誤觸 onUserTurn
    const onScrollEnd = () => {
      window.clearTimeout(programmaticTimerRef.current)
      programmaticRef.current = false
    }

    report()
    viewport.addEventListener('scroll', onScroll, { passive: true })
    viewport.addEventListener('scrollend', onScrollEnd)
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      viewport.removeEventListener('scrollend', onScrollEnd)
      window.clearTimeout(programmaticTimerRef.current)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [chapter.index, layoutKey, onPositionChange, onUserTurn])

  // 已經到底（或到頂）之後，再往同方向滑一次才換章
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    /** 觸發了換章就回傳 true，讓呼叫端知道這次手勢已經用掉了 */
    const cross = (forward: boolean): boolean => {
      const { scrollTop, clientHeight, scrollHeight } = viewport
      if (forward ? !atEnd(scrollTop, clientHeight, scrollHeight) : !atStart(scrollTop)) return false

      const now = Date.now()
      if (now - crossedAtRef.current < EDGE_COOLDOWN_MS) {
        // 還在冷卻中卻仍收到邊界事件，代表慣性還沒停：把冷卻順延，要真的停下來才換下一章
        crossedAtRef.current = now
        return false
      }
      crossedAtRef.current = now
      if (forward) onPastEnd()
      else onPastStart()
      return true
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) return
      cross(event.deltaY > 0)
    }

    const onTouchStart = (event: TouchEvent) => {
      startYRef.current = event.touches[0].clientY
      touchCrossedRef.current = false
    }
    const onTouchMove = (event: TouchEvent) => {
      if (touchCrossedRef.current) return
      const dy = event.touches[0].clientY - startYRef.current
      if (Math.abs(dy) < TOUCH_THRESHOLD) return
      if (cross(dy < 0)) touchCrossedRef.current = true
    }

    viewport.addEventListener('wheel', onWheel, { passive: true })
    viewport.addEventListener('touchstart', onTouchStart, { passive: true })
    viewport.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('touchstart', onTouchStart)
      viewport.removeEventListener('touchmove', onTouchMove)
    }
  }, [onPastEnd, onPastStart])

  /** 標記接下來的捲動是程式造成的。正常由 scrollend 收尾，沒有該事件的瀏覽器才靠逾時。 */
  const beginProgrammaticScroll = useCallback(() => {
    programmaticRef.current = true
    window.clearTimeout(programmaticTimerRef.current)
    programmaticTimerRef.current = window.setTimeout(() => {
      programmaticRef.current = false
    }, PROGRAMMATIC_SCROLL_TIMEOUT_MS)
  }, [])

  /**
   * 執行一次程式捲動。目標與現在相同就什麼都不做：
   * 零位移的 scrollTo 不會發出 scroll 或 scrollend，旗標會一直卡著沒人清。
   */
  const scrollProgrammatically = useCallback(
    (viewport: HTMLElement, top: number) => {
      if (Math.abs(top - viewport.scrollTop) < 1) return
      beginProgrammaticScroll()
      viewport.scrollTo({ top, behavior: 'smooth' })
    },
    [beginProgrammaticScroll],
  )

  const turn = useCallback(
    (delta: number) => {
      const viewport = viewportRef.current
      const content = contentRef.current
      if (!viewport || !content) return
      const { scrollTop, clientHeight, scrollHeight } = viewport

      // 鍵盤不套換章冷卻：每次按鍵都是明確意圖，不像慣性滾動需要「停下來才算數」
      if (delta > 0 && atEnd(scrollTop, clientHeight, scrollHeight)) {
        onPastEnd()
        return
      }
      if (delta < 0 && atStart(scrollTop)) {
        onPastStart()
        return
      }

      const top = turnScrollTop(scrollTop, clientHeight, scrollHeight, delta)
      scrollProgrammatically(viewport, top)
      if (onUserTurn) onUserTurn(charOffsetAtScrollTop(content, top))
    },
    [onPastEnd, onPastStart, onUserTurn, scrollProgrammatically],
  )

  const reveal = useCallback(
    (offset: number) => {
      const viewport = viewportRef.current
      const content = contentRef.current
      if (!viewport || !content) return
      const top = revealScrollTop(
        scrollTopForCharOffset(content, offset),
        viewport.scrollTop,
        viewport.clientHeight,
        viewport.scrollHeight,
      )
      if (top === null) return
      scrollProgrammatically(viewport, top)
    },
    [scrollProgrammatically],
  )

  useEffect(() => {
    pagerRef.current = { turn, reveal }
    return () => {
      pagerRef.current = null
    }
  }, [pagerRef, turn, reveal])

  return (
    <div className="pager pager--scroll" ref={viewportRef}>
      <div className="chapter" ref={contentRef} lang="zh-TW" />
    </div>
  )
}
