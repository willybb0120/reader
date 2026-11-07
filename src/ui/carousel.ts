/**
 * 書櫃 3D 轉盤的幾何與物理。pos 是「目前正對前方的書」的浮點索引，
 * 拖曳時直接改 pos，放手後由彈簧拉向整數 target。
 */

/** 角距上下限（度）。書少時不散成整圈，書多時只露出前半圈 */
const MIN_STEP = 22
const MAX_STEP = 40
/** 相鄰封面中心的弦長是封面寬的幾倍，留一點縫 */
const CHORD_RATIO = 1.18
/** 超過這個角度就在背後，不畫 */
const HIDDEN_ANGLE = 125
/** 從這個角度開始淡出 */
const FADE_ANGLE = 85
const STIFFNESS = 170
const DAMPING = 26
/** 放手速度換算成多滑幾本的比例 */
const FLING = 0.28
/** 放手速度上限（本／秒），再快的甩動最多也只多滑 MAX_SPEED × FLING 本 */
const MAX_SPEED = 20

export interface RingLayout {
  step: number
  radius: number
}

export interface Pose {
  visible: boolean
  transform: string
  opacity: number
  /** 0 至 1，正前方為 1，用來升起、放大與加深陰影 */
  lift: number
  zIndex: number
  brightness: number
}

/** 兩個索引在圓上的最短帶號距離 */
export function wrapDelta(delta: number, count: number): number {
  if (count <= 1) return 0
  return (((delta % count) + count * 1.5) % count) - count / 2
}

export function ringLayout(count: number, coverWidth: number): RingLayout {
  const step = Math.min(MAX_STEP, Math.max(MIN_STEP, 360 / Math.max(1, count)))
  const radius = (coverWidth * CHORD_RATIO) / 2 / Math.sin((step * Math.PI) / 360)
  return { step, radius }
}

/** 距離正前方 delta 本的書該擺在哪裡 */
export function bookPose(delta: number, { step, radius }: RingLayout, coverHeight: number): Pose {
  const angle = delta * step
  const abs = Math.abs(angle)
  // smoothstep：升起的曲線頭尾都平順，拖曳經過時不會有折角
  const t = Math.max(0, 1 - Math.abs(delta))
  const lift = t * t * (3 - 2 * t)
  return {
    visible: abs <= HIDDEN_ANGLE,
    transform:
      `rotateY(${angle}deg) translateZ(${radius}px) rotateY(${-angle * 0.35}deg) ` +
      `translateY(${-lift * coverHeight * 0.16}px) scale(${1 + lift * 0.12})`,
    opacity: abs > FADE_ANGLE ? Math.max(0, 1 - (abs - FADE_ANGLE) / (HIDDEN_ANGLE - FADE_ANGLE)) : 1,
    lift,
    zIndex: 1000 - Math.round(abs),
    brightness: 1 - (Math.min(abs, 90) / 90) * 0.28,
  }
}

export function snapTarget(pos: number, velocity: number): number {
  return Math.round(pos + clampSpeed(velocity) * FLING)
}

export function clampSpeed(velocity: number): number {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity))
}

export function stepSpring(
  { pos, vel }: { pos: number; vel: number },
  target: number,
  dt: number,
): { pos: number; vel: number } {
  const nextVel = vel + ((target - pos) * STIFFNESS - vel * DAMPING) * dt
  const nextPos = pos + nextVel * dt
  if (Math.abs(target - nextPos) < 0.0005 && Math.abs(nextVel) < 0.001) return { pos: target, vel: 0 }
  return { pos: nextPos, vel: nextVel }
}

export function filterBooks<T extends { title: string; creator?: string }>(
  books: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...books]
  return books.filter((book) =>
    `${book.title}\n${book.creator ?? ''}`.toLowerCase().includes(needle),
  )
}
