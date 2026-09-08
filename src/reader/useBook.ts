import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseEpub, type Book, type Chapter } from '../epub/parseEpub'
import { loadBookFile, touchBook } from '../store/library'
import { loadProgress, overallProgress, remainingMinutes, saveProgress } from '../store/progress'
import { withTrimmedImages } from './trimImages'

export type Status = 'idle' | 'loading' | 'ready' | 'error'

const SAVE_INTERVAL_MS = 800

function scrollRatio(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  return scrollable > 0 ? window.scrollY / scrollable : 0
}

/** 開啟書櫃中的某一本書，並持續記錄閱讀進度。id 為 null 時不載入任何書。 */
export function useBook(id: string | null) {
  const [book, setBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [fragment, setFragment] = useState<string | undefined>()
  const [initialScrollRatio, setInitialScrollRatio] = useState(0)
  const [status, setStatus] = useState<Status>(id ? 'loading' : 'idle')
  const [error, setError] = useState('')
  const [chapterTexts, setChapterTexts] = useState<string[]>([])
  const [chapterTitles, setChapterTitles] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  const bookRef = useRef<Book | null>(null)
  const chapterRef = useRef<Chapter | null>(null)
  const lastSaveRef = useRef(0)
  const chapterLengths = useMemo(() => chapterTexts.map((text) => text.length), [chapterTexts])
  const lengthsRef = useRef<number[]>([])

  chapterRef.current = chapter
  lengthsRef.current = chapterLengths

  useEffect(() => {
    if (!id) {
      setBook(null)
      setChapter(null)
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')
    setError('')

    void (async () => {
      try {
        const data = await loadBookFile(id)
        if (!data) throw new Error('書櫃裡找不到這本書的檔案')
        const parsed = await parseEpub(data)
        if (cancelled) {
          parsed.dispose()
          return
        }

        bookRef.current?.dispose()
        bookRef.current = parsed
        await touchBook(id)

        const saved = loadProgress(id)
        const startIndex = Math.min(saved?.chapterIndex ?? 0, parsed.spine.length - 1)
        const raw = await parsed.getChapter(startIndex)

        setBook(parsed)
        setChapterTexts([])
        setChapterTitles([])
        setFragment(undefined)
        setInitialScrollRatio(saved?.scrollRatio ?? 0)
        setChapter({ ...raw, html: await withTrimmedImages(raw.html) })
        setStatus('ready')
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  // 背景整理各章文字，供搜尋與進度加權
  useEffect(() => {
    if (!book) return
    let cancelled = false
    void (async () => {
      const texts: string[] = []
      const titles: string[] = []
      for (let i = 0; i < book.spine.length; i++) {
        texts.push(await book.getChapterText(i))
        titles.push((await book.getChapter(i)).title)
        if (cancelled) return
      }
      if (cancelled) return
      setChapterTexts(texts)
      setChapterTitles(titles)
    })()
    return () => {
      cancelled = true
    }
  }, [book])

  const goToChapter = useCallback(async (index: number, targetFragment?: string) => {
    const current = bookRef.current
    if (!current || index < 0 || index >= current.spine.length) return
    const raw = await current.getChapter(index)
    setInitialScrollRatio(0)
    setFragment(targetFragment)
    setChapter({ ...raw, html: await withTrimmedImages(raw.html) })
  }, [])

  // 捲動時更新進度並節流寫入
  useEffect(() => {
    if (status !== 'ready' || !id) return

    const onScroll = () => {
      const ratio = scrollRatio()
      const index = chapterRef.current?.index ?? 0
      const overall = overallProgress(lengthsRef.current, index, ratio)
      setProgress(overall)
      setMinutesLeft(remainingMinutes(lengthsRef.current, index, ratio))

      const now = Date.now()
      if (now - lastSaveRef.current < SAVE_INTERVAL_MS) return
      lastSaveRef.current = now
      saveProgress(id, { chapterIndex: index, scrollRatio: ratio, overall })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      const ratio = scrollRatio()
      const index = chapterRef.current?.index ?? 0
      saveProgress(id, {
        chapterIndex: index,
        scrollRatio: ratio,
        overall: overallProgress(lengthsRef.current, index, ratio),
      })
    }
  }, [status, id, chapter, chapterLengths])

  return {
    book,
    chapter,
    fragment,
    initialScrollRatio,
    status,
    error,
    chapterTexts,
    chapterTitles,
    progress,
    minutesLeft,
    goToChapter,
  }
}
