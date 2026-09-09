import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings'

describe('閱讀設定', () => {
  beforeEach(() => localStorage.clear())

  test('沒有存過設定時回傳預設值', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  test('存檔後可讀回', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, fontSize: 22, theme: 'dark' }

    saveSettings(settings)

    expect(loadSettings()).toEqual(settings)
  })

  test('只補上缺少的欄位，保留已存的值', () => {
    localStorage.setItem('reader:settings', JSON.stringify({ fontSize: 20 }))

    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, fontSize: 20 })
  })

  test('超出範圍的數值會被夾回合理區間', () => {
    localStorage.setItem('reader:settings', JSON.stringify({ fontSize: 999, lineHeight: 0.1 }))

    const settings = loadSettings()

    expect(settings.fontSize).toBe(28)
    expect(settings.lineHeight).toBe(1.4)
  })

  test('無法辨識的主題名稱退回預設', () => {
    localStorage.setItem('reader:settings', JSON.stringify({ theme: '螢光綠' }))

    expect(loadSettings().theme).toBe(DEFAULT_SETTINGS.theme)
  })

  test('儲存內容毀損時回傳預設值而非拋錯', () => {
    localStorage.setItem('reader:settings', '{壞掉的 JSON')

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('朗讀設定', () => {
  beforeEach(() => localStorage.clear())

  test('預設語速為 1，語音留空表示用系統預設', () => {
    expect(loadSettings().rate).toBe(1)
    expect(loadSettings().voiceUri).toBe('')
  })

  test('語速超出範圍會被夾回來', () => {
    localStorage.setItem('reader:settings', JSON.stringify({ rate: 9 }))

    expect(loadSettings().rate).toBe(2.5)
  })

  test('記住選過的語音', () => {
    saveSettings({ ...DEFAULT_SETTINGS, voiceUri: 'Microsoft HsiaoChen' })

    expect(loadSettings().voiceUri).toBe('Microsoft HsiaoChen')
  })
})
