export interface Voice {
  uri: string
  name: string
  lang: string
}

export interface SpeakOptions {
  rate: number
  voiceUri?: string
  lang: string
}

export type SpeakResult = 'ended' | 'cancelled' | 'failed'

export interface SpeechEngine {
  supported: boolean
  speak(text: string, options: SpeakOptions): Promise<SpeakResult>
  cancel(): void
  getVoices(): Voice[]
  /** 語音清單是非同步載入的，變動時通知 */
  onVoicesChanged(listener: () => void): () => void
}

/** Chrome 長時間朗讀會自行暫停，定期 resume 才不會斷在句子中間 */
const KEEPALIVE_MS = 8000

export function createSpeechEngine(): SpeechEngine {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined

  if (!synth) {
    return {
      supported: false,
      speak: async () => 'failed',
      cancel: () => {},
      getVoices: () => [],
      onVoicesChanged: () => () => {},
    }
  }

  let keepalive: ReturnType<typeof setInterval> | undefined

  const stopKeepalive = () => {
    if (keepalive !== undefined) clearInterval(keepalive)
    keepalive = undefined
  }

  return {
    supported: true,

    speak(text, options) {
      return new Promise<SpeakResult>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = options.rate
        utterance.lang = options.lang
        const voice = synth.getVoices().find((item) => item.voiceURI === options.voiceUri)
        if (voice) utterance.voice = voice

        let settled = false
        const finish = (result: SpeakResult) => {
          if (settled) return
          settled = true
          stopKeepalive()
          resolve(result)
        }

        utterance.onend = () => finish('ended')
        utterance.onerror = (event) =>
          finish(event.error === 'interrupted' || event.error === 'canceled' ? 'cancelled' : 'failed')

        stopKeepalive()
        keepalive = setInterval(() => synth.resume(), KEEPALIVE_MS)
        synth.speak(utterance)
      })
    },

    cancel() {
      stopKeepalive()
      synth.cancel()
    },

    getVoices() {
      return synth
        .getVoices()
        .map((voice) => ({ uri: voice.voiceURI, name: voice.name, lang: voice.lang }))
    },

    onVoicesChanged(listener) {
      synth.addEventListener('voiceschanged', listener)
      return () => synth.removeEventListener('voiceschanged', listener)
    },
  }
}

/** 依書籍語言挑一個預設語音：先找完全相同的語言標籤，再找同語系 */
export function pickDefaultVoice(voices: readonly Voice[], lang: string): Voice | undefined {
  const normalize = (value: string) => value.toLowerCase().replace('_', '-')
  const target = normalize(lang)
  const base = target.split('-')[0]
  return (
    voices.find((voice) => normalize(voice.lang) === target) ??
    voices.find((voice) => normalize(voice.lang).startsWith(base))
  )
}
