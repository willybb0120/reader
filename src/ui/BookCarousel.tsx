import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BookRecord } from '../store/library'
import { loadProgress } from '../store/progress'
import { bookPose, clampSpeed, ringLayout, snapTarget, stepSpring, wrapDelta } from './carousel'
import { CoverImage } from './CoverImage'

interface BookCarouselProps {
  books: BookRecord[]
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

/** 拖超過這個距離才算拖曳，否則當成點擊 */
const DRAG_THRESHOLD = 6
/** 放手前停住超過這段時間，就當成「放下」而不是「甩出去」 */
const FLING_IDLE_MS = 80
/** 滾輪一格轉一本，間隔太短的連續事件（觸控板慣性）忽略 */
const WHEEL_INTERVAL_MS = 90

function coverSize(): { width: number; height: number } {
  const width = window.innerWidth < 600 ? Math.min(150, window.innerWidth * 0.4) : 180
  return { width, height: width * 1.5 }
}

interface Drag {
  pointerId: number
  startX: number
  startPos: number
  lastX: number
  lastT: number
  velocity: number
  active: boolean
}

/**
 * 3D 轉盤書櫃。每幀直接寫入 DOM 的 transform，不經 React state，拖曳才跟得上手指；
 * 只有正前方換了一本書時才更新 state，讓下方的書名資訊跟著換。
 */
export function BookCarousel({ books, onOpen, onRemove }: BookCarouselProps) {
  const count = books.length
  const [size, setSize] = useState(coverSize)
  const layout = useMemo(() => ringLayout(count, size.width), [count, size.width])
  const [center, setCenter] = useState(0)

  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const motion = useRef({ pos: 0, vel: 0, target: 0 })
  const drag = useRef<Drag | null>(null)
  /** 剛拖曳完的那次 click 不能當成點書 */
  const suppressClick = useRef(false)
  const frameRef = useRef(0)
  const centerRef = useRef(0)
  /** 書單變動（搜尋、刪書）後，盡量讓同一本書留在正前方 */
  const centerIdRef = useRef<string | null>(null)

  const index = useCallback((pos: number) => ((Math.round(pos) % count) + count) % count, [count])

  const paint = useCallback(() => {
    const { pos } = motion.current
    cardRefs.current.forEach((el, i) => {
      if (!el) return
      const pose = bookPose(wrapDelta(i - pos, count), layout, size.height)
      el.style.visibility = pose.visible ? 'visible' : 'hidden'
      if (!pose.visible) return
      el.style.transform = pose.transform
      el.style.opacity = String(pose.opacity)
      el.style.zIndex = String(pose.zIndex)
      el.style.filter = `brightness(${pose.brightness})`
      el.style.setProperty('--lift', pose.lift.toFixed(3))
    })
    const current = count > 0 ? index(pos) : 0
    if (current !== centerRef.current) {
      centerRef.current = current
      setCenter(current)
    }
  }, [count, layout, size.height, index])

  /** 有動靜時才跑動畫迴圈，停穩了就收掉，手機才不會一直耗電 */
  const kick = useCallback(() => {
    if (frameRef.current) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      const m = motion.current
      if (!drag.current?.active) Object.assign(m, stepSpring(m, m.target, dt))
      paint()
      const settled = !drag.current?.active && m.pos === m.target && m.vel === 0
      frameRef.current = settled ? 0 : requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [paint])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const goTo = useCallback(
    (target: number) => {
      motion.current.target = target
      kick()
    },
    [kick],
  )

  useLayoutEffect(() => {
    const keep = books.findIndex((book) => book.id === centerIdRef.current)
    const start = Math.max(0, keep)
    motion.current = { pos: start, vel: 0, target: start }
    centerRef.current = start
    setCenter(start)
    paint()
  }, [books, paint])

  useEffect(() => {
    centerIdRef.current = books[center]?.id ?? null
  }, [books, center])

  useEffect(() => {
    const onResize = () => setSize(coverSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 方向鍵轉動；輸入框裡的方向鍵留給游標
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      goTo(Math.round(motion.current.target) + (event.key === 'ArrowRight' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo])

  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let lastWheel = 0
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      event.preventDefault()
      const now = performance.now()
      if (Math.abs(delta) < 4 || now - lastWheel < WHEEL_INTERVAL_MS) return
      lastWheel = now
      goTo(Math.round(motion.current.target) + Math.sign(delta))
    }
    // React 的 onWheel 是 passive，無法 preventDefault 擋掉頁面捲動
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [goTo])

  const pxPerBook = size.width * 1.1

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startPos: motion.current.pos,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
      active: false,
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId) return
    const dx = event.clientX - d.startX
    if (!d.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      // 確定是拖曳才接管指標；只是點一下就讓按鈕自己收到 click
      d.active = true
      stageRef.current?.setPointerCapture(event.pointerId)
    }
    const now = performance.now()
    const instant = (-(event.clientX - d.lastX) / pxPerBook / Math.max(1, now - d.lastT)) * 1000
    d.velocity = d.velocity * 0.6 + instant * 0.4
    d.lastX = event.clientX
    d.lastT = now
    motion.current.pos = d.startPos - dx / pxPerBook
    kick()
  }

  const onPointerEnd = (event: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId) return
    drag.current = null
    if (!d.active) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 0)
    const velocity = performance.now() - d.lastT > FLING_IDLE_MS ? 0 : clampSpeed(d.velocity)
    const m = motion.current
    m.vel = velocity
    goTo(snapTarget(m.pos, velocity))
  }

  const onCardClick = (i: number) => {
    if (suppressClick.current) return
    const delta = wrapDelta(i - motion.current.pos, count)
    if (Math.abs(delta) < 0.5) onOpen(books[i].id)
    else goTo(Math.round(motion.current.pos + delta))
  }

  const current = books[center]
  const percent = current ? Math.round((loadProgress(current.id)?.overall ?? 0) * 100) : 0

  return (
    <div
      className="carousel"
      style={{ '--cover-w': `${size.width}px`, '--cover-h': `${size.height}px` } as React.CSSProperties}
    >
      <div
        ref={stageRef}
        className="carousel__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className="carousel__ring" style={{ transform: `translateZ(${-layout.radius}px)` }}>
          {books.map((book, i) => {
            const progress = Math.round((loadProgress(book.id)?.overall ?? 0) * 100)
            return (
              <div
                key={book.id}
                ref={(el) => void (cardRefs.current[i] = el)}
                className="book-card"
                data-center={i === center}
              >
                <button
                  className="book-card__open"
                  onClick={() => onCardClick(i)}
                  aria-label={i === center ? `開啟 ${book.title}` : `轉到 ${book.title}`}
                >
                  <span className="book-card__frame">
                    <CoverImage book={book} />
                    {progress > 0 && <span className="book-card__progress">{progress}%</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {current && (
        <div className="carousel__info" key={current.id}>
          <div className="carousel__title">{current.title}</div>
          <div className="carousel__meta">
            {current.creator}
            {current.creator && ' · '}
            {percent > 0 ? `讀到 ${percent}%` : '還沒開始讀'}
          </div>
          <div className="carousel__bar">
            <i style={{ width: `${percent}%` }} />
          </div>
          <button
            className="carousel__remove"
            onClick={() => {
              if (window.confirm(`從書櫃移除《${current.title}》？`)) onRemove(current.id)
            }}
          >
            從書櫃移除
          </button>
        </div>
      )}

      {count > 1 && (
        <div className="carousel__dots" aria-hidden>
          {Array.from({ length: Math.min(count, 40) }, (_, k) => (
            <span key={k} data-on={k === Math.floor((center / count) * Math.min(count, 40))} />
          ))}
        </div>
      )}
    </div>
  )
}
