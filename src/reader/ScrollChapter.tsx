import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { useChapterContent } from './useChapterContent'
import { charOffsetAtScrollTop, scrollTopForCharOffset, scrollTopForElement } from './pageMetrics'
import { plainText } from './textRange'
import { createProgrammaticScrollGuard } from './scrollGuard'
import { atEnd, atStart, clampScrollTop, revealScrollTop, turnScrollTop } from './scroll'

/** 換章後的冷卻時間，避免慣性滾動一路翻過好幾章 */
const EDGE_COOLDOWN_MS = 600
/** 小於這個滾輪位移視為雜訊，不當成換章意圖 */
const WHEEL_THRESHOLD = 4
/** 觸控要滑動這麼多像素才算一次明確的換章意圖 */
const TOUCH_THRESHOLD = 60
/**
 * 捲動停止多久才算「安定」，沒有 scrollend 事件的瀏覽器用這個逾時後備。
 * App 存檔本來就節流到 800ms，這裡不需要更即時；同時也是回報位置／朗讀 seek 的收斂點，
 * 太短會讓慣性滾動中間也觸發，太長會讓進度看起來卡頓。
 */
const SCROLL_IDLE_MS = 200

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
  /** 章節純文字長度；只在內容真的變動時整棵樹算一次，捲動收斂回報時直接複用 */
  const chapterLengthRef = useRef(0)

  /**
   * 程式捲動（翻頁／朗讀跟隨／重排）進行中的旗標，抽成獨立工廠方便單元測試。
   * 用 lazy ref 只建立一次，讓它的生命週期跟著元件本身，不受其他 effect 的
   * 依賴陣列變動（例如 onUserTurn 隨朗讀播放／暫停改變）影響而被重建或重置。
   */
  const guardRef = useRef<ReturnType<typeof createProgrammaticScrollGuard> | null>(null)
  if (!guardRef.current) guardRef.current = createProgrammaticScrollGuard()
  const guard = guardRef.current

  useEffect(() => () => guard.dispose(), [guard])

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

  // 章節文字實際變動才重新量測長度，不要每次捲動都重算
  useLayoutEffect(() => {
    const content = contentRef.current
    chapterLengthRef.current = content ? plainText(content).length : 0
  }, [chapter.html, annotations, highlightRange])

  // 回報位置與朗讀 seek 的單一收斂點：捲動停止（scrollend，或沒有該事件時 SCROLL_IDLE_MS 靜止）
  // 才做一次，而不是每幀都做。逐幀 seek 會讓 speechSynthesis 被連續 cancel/speak，容易掉句或卡死；
  // 逐幀量測也要整章重走一遍文字節點，手機上會掉幀。
  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    let idleTimer: ReturnType<typeof setTimeout> | undefined

    const report = () => {
      idleTimer = undefined
      const offset = charOffsetAtScrollTop(content, viewport.scrollTop)
      onPositionChange(offset, chapterLengthRef.current)
      if (guard.active) return
      if (onUserTurn) onUserTurn(offset)
    }
    const onScroll = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(report, SCROLL_IDLE_MS)
    }
    // scrollend 在最後一次 scroll 事件之後才發，所以要先用當下的旗標值 report()，
    // 不會誤觸 onUserTurn，再把旗標解除，留給下一次真正的使用者捲動用
    const onScrollEnd = () => {
      clearTimeout(idleTimer)
      idleTimer = undefined
      report()
      guard.onScrollEnd()
    }

    report()
    viewport.addEventListener('scroll', onScroll, { passive: true })
    viewport.addEventListener('scrollend', onScrollEnd)
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      viewport.removeEventListener('scrollend', onScrollEnd)
      clearTimeout(idleTimer)
    }
  }, [chapter.index, layoutKey, onPositionChange, onUserTurn, guard])

  // 視窗大小改變時（例如手機轉向）用目前讀到的字元位移重新定位，避免重排後 scrollTop 指向別的文字
  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const observer = new ResizeObserver(() => {
      const offset = charOffsetAtScrollTop(content, viewport.scrollTop)
      guard.begin()
      settle({ kind: 'offset', offset })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [settle, guard])

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

  /**
   * 執行一次程式捲動。目標與現在相同就什麼都不做：
   * 零位移的 scrollTo 不會發出 scroll 或 scrollend，旗標會一直卡著沒人清。
   */
  const scrollProgrammatically = useCallback(
    (viewport: HTMLElement, top: number) => {
      if (Math.abs(top - viewport.scrollTop) < 1) return
      guard.begin()
      viewport.scrollTo({ top, behavior: 'smooth' })
    },
    [guard],
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
