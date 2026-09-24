import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChapterViewProps, Entry } from './chapterTypes'
import { useChapterContent } from './useChapterContent'
import { charOffsetAtScrollTop, scrollTopForCharOffset, scrollTopForElement } from './pageMetrics'
import { plainText } from './textRange'
import { createProgrammaticScrollGuard } from './scrollGuard'
import { atEnd, atStart, clampScrollTop, pullOffset, revealScrollTop, turnScrollTop } from './scroll'

/** 換章後的冷卻時間，避免慣性滾動一路翻過好幾章 */
const EDGE_COOLDOWN_MS = 600
/** 小於這個滾輪位移視為雜訊，不當成換章意圖 */
const WHEEL_THRESHOLD = 4
/**
 * 觸控拉曳位移相對原始手指位移的阻尼比例。
 * 0.4 讓整段拉曳仍有跟手的回饋，又不會手指滑一小段就衝到上限。
 */
const PULL_DAMPING = 0.4
/** 拉曳位移上限（像素），避免指示器與內容被拉出可視範圍太多 */
const PULL_MAX = 120
/** 拉曳位移達到這個像素數，放開才會真的換章；比 PULL_MAX 小，留出「已達門檻」的緩衝區間 */
const PULL_THRESHOLD = 72
/** 拉不夠放開時，內容彈回原位的動畫時間，沿用 .chapter[data-animate] 的過場長度 */
const PULL_REBOUND_MS = 220
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
  const indicatorRef = useRef<HTMLDivElement>(null)
  /** 上次換章的時間，用來擋住慣性滾動連續觸發 */
  const crossedAtRef = useRef(0)
  /** 觸控起點的 Y 座標，effect 重新註冊（換章時 callback 變了）也不能被重設 */
  const startYRef = useRef(0)
  /** 這次觸碰是否已經換過章，避免一次連續觸碰換兩章 */
  const touchCrossedRef = useRef(false)
  /** 目前是否在拉曳中，以及往哪個方向；null 代表沒有在拉 */
  const pullDirRef = useRef<'end' | 'start' | null>(null)
  /** 拉曳中的目前位移（像素，阻尼與上限之後的值），touchend 判斷是否達門檻要用 */
  const pullPxRef = useRef(0)
  /** 回彈動畫結束後要清掉 transition 的 timer id，換章／連續拉曳／卸載時要能取消，不留孤兒 timer */
  const reboundTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** 拉曳方向只用來控制指示器的掛載／卸載；位移本身不經 state，直接寫 DOM 才夠即時 */
  const [pullDir, setPullDir] = useState<'end' | 'start' | null>(null)
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
      const target = clampScrollTop(
        scrollTopForCharOffset(content, offset),
        viewport.clientHeight,
        viewport.scrollHeight,
      )
      // 重排後算出的位置跟現在幾乎一樣就不開旗標：零位移的 scrollTop 寫入不會發出
      // scroll／scrollend，旗標會一路卡到 1200ms 逾時，期間使用者捲動不會重新定位朗讀。
      // 跟 scrollProgrammatically 用的是同一道零位移護欄。
      if (Math.abs(target - viewport.scrollTop) >= 1) guard.begin()
      settle({ kind: 'offset', offset })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [settle, guard])

  /**
   * 把目前的拉曳位移套到內容與指示器上。位移本身不經 React state，
   * 每次 touchmove 都直接寫 DOM，state 只負責指示器的掛載／卸載（見下方 pullDir）。
   */
  const applyPull = useCallback((dir: 'end' | 'start', pull: number) => {
    pullPxRef.current = pull
    const content = contentRef.current
    if (content) {
      // 章尾拉曳內容往上移（負值）、章首拉曳內容往下移（正值），跟手指方向一致
      content.style.transform = pull > 0 ? `translateY(${dir === 'end' ? -pull : pull}px)` : ''
    }
    const indicator = indicatorRef.current
    if (!indicator) return
    indicator.style.opacity = String(Math.min(1, pull / PULL_THRESHOLD))
    indicator.dataset.armed = pull >= PULL_THRESHOLD ? 'true' : 'false'
  }, [])

  /**
   * 放開手指：animate=true 是「拉不夠，彈回去」，套 CSS transition；
   * animate=false 是「換章了」，換章本身是直接定位（settle 沒有動畫），位移也不需要動畫，
   * 直接歸零即可，否則舊章節的內容會在新章節內容蓋上來之前先滑動一次，畫面會跳。
   */
  const releasePull = useCallback((animate: boolean) => {
    if (reboundTimerRef.current !== undefined) {
      clearTimeout(reboundTimerRef.current)
      reboundTimerRef.current = undefined
    }
    const content = contentRef.current
    if (content) {
      content.style.transition = animate
        ? 'transform 0.22s cubic-bezier(0.22, 0.8, 0.3, 1)'
        : 'none'
      content.style.transform = ''
      if (animate) {
        reboundTimerRef.current = setTimeout(() => {
          // 動畫跑完就把 transition 清掉，下一次拉曳才不會誤帶動畫
          reboundTimerRef.current = undefined
          if (contentRef.current === content) content.style.transition = ''
        }, PULL_REBOUND_MS)
      } else {
        content.style.transition = ''
      }
    }
    pullPxRef.current = 0
    pullDirRef.current = null
    setPullDir(null)
  }, [])

  // 元件卸載時把回彈 timer 清掉，避免它活得比自己的擁有者還久
  useEffect(() => {
    return () => {
      if (reboundTimerRef.current !== undefined) clearTimeout(reboundTimerRef.current)
    }
  }, [])

  // 指示器掛載後才量測位置：內容拉曳用的是 transform 不是真的 scroll，
  // 所以指示器要用量到的視窗矩形釘住位置，不會隨拉曳而跑掉。
  useLayoutEffect(() => {
    const dir = pullDir
    const indicator = indicatorRef.current
    const viewport = viewportRef.current
    if (!dir || !indicator || !viewport) return
    const rect = viewport.getBoundingClientRect()
    indicator.style.left = `${rect.left + rect.width / 2}px`
    indicator.style.top = dir === 'end' ? `${rect.bottom - 44}px` : `${rect.top + 16}px`
    // 掛載當下立刻同步一次視覺狀態，避免第一幀因為指示器剛掛上、還沒套到目前的拉曳量而閃爍
    applyPull(dir, pullPxRef.current)
  }, [pullDir, applyPull])

  // 已經到底（或到頂）之後才有換章意圖：滾輪維持「再滑一次」的既有行為與冷卻；
  // 觸控改成「拉曳 + 放開確認」，拉曳中即時回饋，放開才真的換章，拉回原位可以取消。
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
      pullDirRef.current = null
    }

    const onTouchMove = (event: TouchEvent) => {
      if (touchCrossedRef.current) return
      const clientY = event.touches[0].clientY
      let dy = clientY - startYRef.current

      if (!pullDirRef.current) {
        const { scrollTop, clientHeight, scrollHeight } = viewport
        const wantEnd = dy < 0 && atEnd(scrollTop, clientHeight, scrollHeight)
        const wantStart = dy > 0 && atStart(scrollTop)
        if (!wantEnd && !wantStart) return // 不在邊界或方向不對：交給瀏覽器當一般捲動
        // 剛換完章的冷卻窗內不進入拉曳，避免內容很短的下一章一開始就 atEnd/atStart，
        // 殘留的手勢一拉就又觸發換章
        if (Date.now() - crossedAtRef.current < EDGE_COOLDOWN_MS) return
        pullDirRef.current = wantEnd ? 'end' : 'start'
        setPullDir(pullDirRef.current)
        // 位移要從「進入拉曳」這一刻重新起算，不能沿用手指按下到現在的整段距離——
        // 否則一路滑到底再繼續拉的正常手勢，第一幀就會被當成已經拉了一大段
        startYRef.current = clientY
        dy = 0
      }

      // 進入拉曳後要接管位移，才能讓內容跟著手指走；不在拉曳中的 touchmove 完全不擋，
      // 章節中段的一般捲動不受影響
      event.preventDefault()
      const dir = pullDirRef.current
      const raw = dir === 'end' ? -dy : dy
      applyPull(dir, pullOffset(raw, PULL_DAMPING, PULL_MAX))
    }

    const onTouchEnd = () => {
      const dir = pullDirRef.current
      if (!dir) return
      const armed = pullPxRef.current >= PULL_THRESHOLD
      if (armed && cross(dir === 'end')) {
        touchCrossedRef.current = true
        releasePull(false)
      } else {
        releasePull(true)
      }
    }

    viewport.addEventListener('wheel', onWheel, { passive: true })
    viewport.addEventListener('touchstart', onTouchStart, { passive: true })
    // 拉曳中要 preventDefault 接管位移，這條必須是 active listener
    viewport.addEventListener('touchmove', onTouchMove, { passive: false })
    viewport.addEventListener('touchend', onTouchEnd, { passive: true })
    viewport.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('touchstart', onTouchStart)
      viewport.removeEventListener('touchmove', onTouchMove)
      viewport.removeEventListener('touchend', onTouchEnd)
      viewport.removeEventListener('touchcancel', onTouchEnd)
      // 防護：如果 effect 重新註冊（deps 變了）或元件卸載時手指還按著，
      // 換章可能是透過別的路徑發生（例如點了目錄），沒人會再收到這次的 touchend，
      // 把拉曳狀態與位移強制歸零，不留孤兒的 transform
      if (pullDirRef.current) releasePull(false)
    }
  }, [onPastEnd, onPastStart, applyPull, releasePull])

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
      {pullDir && (
        <div
          ref={indicatorRef}
          className={`pull-indicator pull-indicator--${pullDir}`}
          aria-hidden="true"
        >
          <svg
            className="pull-indicator__arrow"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
          <span className="pull-indicator__label">
            {pullDir === 'end' ? '放開換下一章' : '放開回上一章'}
          </span>
        </div>
      )}
    </div>
  )
}
