import { useCallback, useEffect, useState } from 'react'
import { createStore, get, set } from 'idb-keyval'
import type { Chapter } from '../epub/parseEpub'
import { batchTexts, translatableBlocks, translateBlocks } from './translate'

/** 已翻好的章節存起來：同一章不重複打網路，離線也看得到 */
const store = createStore('reader-translations', 'chapters')

export type TranslationStatus = 'loading' | 'done' | 'error'

interface State {
  key: string
  /** 與 translatableBlocks 的順序一一對應，尚未翻到的為 undefined */
  texts: (string | undefined)[]
  status: TranslationStatus
  error?: string
}

/** 翻譯目前這一章。分批抓取，每批回來就更新，讓畫面逐段出現譯文 */
export function useTranslation(bookId: string | null, chapter: Chapter | null, enabled: boolean) {
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = enabled && bookId && chapter ? `${bookId}:${chapter.index}` : null
  const html = chapter?.html ?? ''

  useEffect(() => {
    if (!key) return
    let cancelled = false

    void (async () => {
      const cached = await get<string[]>(key, store)
      if (cancelled) return
      if (cached) {
        setState({ key, texts: cached, status: 'done' })
        return
      }

      const doc = new DOMParser().parseFromString(html, 'text/html')
      const sources = translatableBlocks(doc.body).map((el) => el.textContent ?? '')
      const texts: (string | undefined)[] = new Array(sources.length).fill(undefined)
      setState({ key, texts: [...texts], status: 'loading' })
      try {
        for (const batch of batchTexts(sources)) {
          const translated = await translateBlocks(batch.map((index) => sources[index]))
          if (cancelled) return
          batch.forEach((index, i) => (texts[index] = translated[i]))
          setState({ key, texts: [...texts], status: 'loading' })
        }
        await set(key, texts, store)
        if (!cancelled) setState({ key, texts, status: 'done' })
      } catch (cause) {
        if (cancelled) return
        const error = cause instanceof Error ? cause.message : String(cause)
        setState({ key, texts: [...texts], status: 'error', error })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, html, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  // 換章或關閉後，舊章的譯文不能套到新章上
  const current = key && state?.key === key ? state : null

  return {
    translations: current?.texts,
    status: current?.status ?? null,
    error: current?.error,
    retry,
  }
}
