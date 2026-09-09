import { describe, expect, test } from 'vitest'
import { matchShortcut } from './shortcuts'

const press = (key: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key, target: document.body, ...extra }) as unknown as KeyboardEvent

describe('matchShortcut', () => {
  test('方向鍵與空白鍵翻頁', () => {
    expect(matchShortcut(press('ArrowLeft'))).toBe('prevPage')
    expect(matchShortcut(press('ArrowRight'))).toBe('nextPage')
    expect(matchShortcut(press(' '))).toBe('nextPage')
  })

  test('單鍵開啟各面板', () => {
    expect(matchShortcut(press('t'))).toBe('toc')
    expect(matchShortcut(press('f'))).toBe('search')
    expect(matchShortcut(press('/'))).toBe('search')
    expect(matchShortcut(press('h'))).toBe('annotations')
    expect(matchShortcut(press('a'))).toBe('settings')
    expect(matchShortcut(press('l'))).toBe('library')
    expect(matchShortcut(press('?'))).toBe('help')
  })

  test('大寫也有效', () => {
    expect(matchShortcut(press('T'))).toBe('toc')
  })

  test('調整字級與主題', () => {
    expect(matchShortcut(press('='))).toBe('fontUp')
    expect(matchShortcut(press('+'))).toBe('fontUp')
    expect(matchShortcut(press('-'))).toBe('fontDown')
    expect(matchShortcut(press('d'))).toBe('cycleTheme')
  })

  test('Escape 關閉面板', () => {
    expect(matchShortcut(press('Escape'))).toBe('close')
  })

  test('搭配修飾鍵時不攔截，交給瀏覽器', () => {
    expect(matchShortcut(press('f', { metaKey: true }))).toBeNull()
    expect(matchShortcut(press('f', { ctrlKey: true }))).toBeNull()
  })

  test('在輸入框內不攔截', () => {
    const input = document.createElement('input')
    expect(matchShortcut(press('t', { target: input }))).toBeNull()

    const textarea = document.createElement('textarea')
    expect(matchShortcut(press('t', { target: textarea }))).toBeNull()
  })

  test('輸入框內的 Escape 仍然有效', () => {
    const input = document.createElement('input')
    expect(matchShortcut(press('Escape', { target: input }))).toBe('close')
  })

  test('未定義的按鍵回傳 null', () => {
    expect(matchShortcut(press('z'))).toBeNull()
  })
})
