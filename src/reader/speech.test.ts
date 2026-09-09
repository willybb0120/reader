import { describe, expect, test } from 'vitest'
import { pickDefaultVoice, type Voice } from './speech'

const voices: Voice[] = [
  { uri: 'a', name: '英文', lang: 'en-US' },
  { uri: 'b', name: '中文（中國）', lang: 'zh-CN' },
  { uri: 'c', name: '中文（台灣）', lang: 'zh-TW' },
]

describe('pickDefaultVoice', () => {
  test('優先選語言標籤完全相同的', () => {
    expect(pickDefaultVoice(voices, 'zh-TW')?.uri).toBe('c')
  })

  test('沒有完全相同時退而選同語系', () => {
    expect(pickDefaultVoice(voices, 'zh-HK')?.uri).toBe('b')
  })

  test('大小寫與底線寫法都能對上', () => {
    expect(pickDefaultVoice(voices, 'ZH_tw')?.uri).toBe('c')
  })

  test('完全沒有可用語音時回傳 undefined', () => {
    expect(pickDefaultVoice(voices, 'ja-JP')).toBeUndefined()
    expect(pickDefaultVoice([], 'zh-TW')).toBeUndefined()
  })
})
