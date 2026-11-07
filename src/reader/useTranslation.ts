import { useCallback, useEffect, useState } from 'react'
import { createStore, get, set } from 'idb-keyval'
import type { Book, Chapter } from '../epub/parseEpub'
import { batchTexts, chapterSentences, translateLines } from './translate'

/** 已翻好的章節存起來：同一章不重複打網路，離線也看得到 */
const store = createStore('reader-translations', 'chapters')
/** 快取格式版本。改了切句方式就要換，舊的譯文對不上新的句子 */
const VERSION = 'sentences-v1'
/** 同時送出的請求數：太多容易被 Google 擋，太少長章節要等很久 */
const CONCURRENCY = 3

/** 這次開啟期間翻好的章節。放記憶體才能在換章的第一次渲染就同步拿到，不必先畫原文再重排 */
const memory = new Map<string, string[]>()
/** 正在翻的章節，避免預翻與實際開啟同一章時重複請求 */
const inflight = new Map<string, Promise<string[]>>()

function cacheKey(bookId: string, index: number): string {
  return `${VERSION}:${bookId}:${index}`
}

async function translateAll(sources: string[]): Promise<string[]> {
  const result: string[] = new Array(sources.length).fill('')
  const queue = batchTexts(sources)
  const worker = async () => {
    for (let batch = queue.shift(); batch; batch = queue.shift()) {
      const translated = await translateLines(batch.map((index) => sources[index]))
      batch.forEach((index, i) => (result[index] = translated[i]))
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return result
}

/** 取得一章的逐句譯文：記憶體 → IndexedDB → 網路 */
function loadChapter(key: string, html: string): Promise<string[]> {
  const ready = memory.get(key)
  if (ready) return Promise.resolve(ready)
  const pending = inflight.get(key)
  if (pending) return pending

  const job = (async () => {
    let texts = await get<string[]>(key, store)
    if (!texts) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      texts = await translateAll(chapterSentences(doc.body).map((s) => s.text))
      await set(key, texts, store)
    }
    memory.set(key, texts)
    return texts
  })().finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

interface Status {
  key: string
  state: 'loading' | 'error'
  error?: string
}

/**
 * 翻譯目前這一章。整章翻完才一次交出去，避免譯文分批出現讓版面一直跳；
 * 翻好後順便在背景翻下一章，翻到下一章時就不必等。
 */
export function useTranslation(
  bookId: string | null,
  book: Book | null,
  chapter: Chapter | null,
  enabled: boolean,
) {
  const [status, setStatus] = useState<Status | null>(null)
  const [, setVersion] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const key = enabled && bookId && chapter ? cacheKey(bookId, chapter.index) : null
  const html = chapter?.html ?? ''
  const index = chapter?.index ?? -1

  useEffect(() => {
    if (!key || !bookId) return
    let cancelled = false

    const prefetchNext = () => {
      if (!book || index + 1 >= book.spine.length) return
      void book
        .getChapter(index + 1)
        .then((next) => loadChapter(cacheKey(bookId, index + 1), next.html))
        .catch(() => {
          // 預翻失敗不打擾讀者，真的翻到那章時會重試並顯示錯誤
        })
    }

    if (memory.has(key)) {
      prefetchNext()
      return
    }
    setStatus({ key, state: 'loading' })
    loadChapter(key, html)
      .then(() => {
        if (cancelled) return
        setStatus(null)
        setVersion((n) => n + 1)
        prefetchNext()
      })
      .catch((cause) => {
        if (cancelled) return
        const error = cause instanceof Error ? cause.message : String(cause)
        setStatus({ key, state: 'error', error })
      })

    return () => {
      cancelled = true
    }
  }, [key, bookId, book, html, index, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const current = key && status?.key === key ? status : null

  return {
    translations: key ? memory.get(key) : undefined,
    status: current?.state ?? null,
    error: current?.error,
    retry,
  }
}
