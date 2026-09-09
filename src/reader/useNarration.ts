import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { splitSentences, type Sentence } from './sentences'
import { createSpeechEngine, pickDefaultVoice, type Voice } from './speech'

interface NarrationOptions {
  /** 目前章節的純文字，位移與畫面上的標註共用同一套座標 */
  chapterText: string
  lang: string
  rate: number
  voiceUri?: string
  /** 讓畫面翻到這個字元位移所在的頁 */
  onReveal: (offset: number) => void
  /** 這一章念完了 */
  onChapterEnd: () => void
}

/** 朗讀狀態機：逐句播放、念完推進，章尾交還給呼叫端接下一章。 */
export function useNarration({
  chapterText,
  lang,
  rate,
  voiceUri,
  onReveal,
  onChapterEnd,
}: NarrationOptions) {
  const engine = useMemo(() => createSpeechEngine(), [])
  const sentences = useMemo(() => splitSentences(chapterText), [chapterText])

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [voices, setVoices] = useState<Voice[]>([])

  const revealRef = useRef(onReveal)
  const chapterEndRef = useRef(onChapterEnd)
  revealRef.current = onReveal
  chapterEndRef.current = onChapterEnd

  // 換章時從頭念起；正在播放的話直接接下去
  useEffect(() => setIndex(0), [chapterText])

  useEffect(() => {
    const load = () => setVoices(engine.getVoices())
    load()
    return engine.onVoicesChanged(load)
  }, [engine])

  useEffect(() => () => engine.cancel(), [engine])

  useEffect(() => {
    if (!playing) return

    const current = sentences[index]
    if (!current) {
      chapterEndRef.current()
      return
    }

    let stale = false
    revealRef.current(current.start)
    void engine.speak(current.text, { rate, voiceUri, lang }).then((result) => {
      if (stale) return
      if (result === 'ended') setIndex((value) => value + 1)
      else if (result === 'failed') setPlaying(false)
    })

    return () => {
      stale = true
      engine.cancel()
    }
  }, [engine, playing, index, sentences, rate, voiceUri, lang])

  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => setPlaying((value) => !value), [])

  const step = useCallback(
    (delta: number) => {
      setIndex((value) => Math.min(Math.max(0, value + delta), Math.max(0, sentences.length - 1)))
    },
    [sentences.length],
  )

  /** 把朗讀位置移到某個字元位移所在的句子 */
  const seekToOffset = useCallback(
    (offset: number) => {
      const found = sentences.findIndex((sentence) => sentence.end > offset)
      setIndex(found === -1 ? Math.max(0, sentences.length - 1) : found)
    },
    [sentences],
  )

  const defaultVoice = useMemo(() => pickDefaultVoice(voices, lang), [voices, lang])

  return {
    supported: engine.supported,
    playing,
    sentence: playing ? (sentences[index] as Sentence | undefined) : undefined,
    voices,
    defaultVoice,
    play,
    pause,
    toggle,
    next: useCallback(() => step(1), [step]),
    previous: useCallback(() => step(-1), [step]),
    seekToOffset,
  }
}
