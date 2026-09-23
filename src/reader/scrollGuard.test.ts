import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createProgrammaticScrollGuard } from './scrollGuard'

describe('程式捲動旗標', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('begin() 後旗標為 true', () => {
    const guard = createProgrammaticScrollGuard()
    guard.begin()
    expect(guard.active).toBe(true)
  })

  test('onScrollEnd() 後旗標為 false', () => {
    const guard = createProgrammaticScrollGuard()
    guard.begin()
    guard.onScrollEnd()
    expect(guard.active).toBe(false)
  })

  test('逾時後旗標自動為 false', () => {
    const guard = createProgrammaticScrollGuard(1000)
    guard.begin()
    vi.advanceTimersByTime(999)
    expect(guard.active).toBe(true)
    vi.advanceTimersByTime(1)
    expect(guard.active).toBe(false)
  })

  test('dispose() 後不外洩逾時計時器', () => {
    const guard = createProgrammaticScrollGuard(1000)
    guard.begin()
    guard.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
