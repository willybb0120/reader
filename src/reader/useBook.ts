import { useCallback, useEffect, useRef, useState } from 'react'
import { bundledBooks } from 'virtual:books'
import { parseEpub, type Book, type Chapter } from '../epub/parseEpub'
import { loadProgress, overallProgress, remainingMinutes, saveProgress } from '../store/progress'
import { withTrimmedImages } from './trimImages'

export type Status = 'idle' | 'loading' | 'ready' | 'error'

const SAVE_INTERVAL_MS = 800

function bookId(book: Book): string {
  return book.metadata.identifier || book.metadata.title
}

function scrollRatio(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  return scrollable > 0 ? window.scrollY / scrollable : 0
}

/** 載入書籍、切換章節，並持續記錄閱讀進度。 */
export function useBook() {
  const [book, setBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [fragment, setFragment] = useState<string | undefined>()
  const [initialScrollRatio, setInitialScrollRatio] = useState(0)
  const [status, setStatus] = useState<Status>(bundledBooks.length > 0 ? 'loading' : 'idle')
  const [error, setError] = useState('')
  const [chapterLengths, setChapterLengths] = useState<number[]>([])
  const [progress, setProgress] = useState(0)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  const bookRef = useRef<Book | null>(null)
  const lengthsRef = useRef<number[]>([])
  const chapterRef = useRef<Chapter | null>(null)
  const lastSaveRef = useRef(0)

  chapterRef.current = chapter
  lengthsRef.current = chapterLengths

  const openBook = useCallback(async (load: () => Promise<ArrayBuffer>) => {
    setStatus('loading')
    setError('')
    try {
      const parsed = await parseEpub(await load())
      bookRef.current?.dispose()
      bookRef.current = parsed

      const saved = loadProgress(bookId(parsed))
      const startIndex = Math.min(saved?.chapterIndex ?? 0, parsed.spine.length - 1)
      const raw = await parsed.getChapter(startIndex)

      setBook(parsed)
      setChapterLengths([])
      setFragment(undefined)
      setInitialScrollRatio(saved?.scrollRatio ?? 0)
      setChapter({ ...raw, html: await withTrimmedImages(raw.html) })
      setStatus('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [])

  // 啟動時載入 public/books 內的第一本書
  useEffect(() => {
    const name = bundledBooks[0]
    if (!name) return
    void openBook(async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}books/${encodeURIComponent(name)}`)
      if (!response.ok) throw new Error(`無法載入 ${name}（HTTP ${response.status}）`)
      return response.arrayBuffer()
    })
  }, [openBook])

  // 背景統計各章字數，供全書進度加權
  useEffect(() => {
    if (!book) return
    let cancelled = false
    void (async () => {
      const lengths: number[] = []
      for (let i = 0; i < book.spine.length; i++) {
        lengths.push((await book.getChapterText(i)).length)
        if (cancelled) return
      }
      if (!cancelled) setChapterLengths(lengths)
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
    if (status !== 'ready' || !book) return
    const id = bookId(book)

    const onScroll = () => {
      const ratio = scrollRatio()
      const index = chapterRef.current?.index ?? 0
      setProgress(overallProgress(lengthsRef.current, index, ratio))
      setMinutesLeft(remainingMinutes(lengthsRef.current, index, ratio))

      const now = Date.now()
      if (now - lastSaveRef.current < SAVE_INTERVAL_MS) return
      lastSaveRef.current = now
      saveProgress(id, { chapterIndex: index, scrollRatio: ratio })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      saveProgress(id, {
        chapterIndex: chapterRef.current?.index ?? 0,
        scrollRatio: scrollRatio(),
      })
    }
  }, [status, book, chapter, chapterLengths])

  return {
    book,
    bookId: book ? bookId(book) : '',
    chapter,
    fragment,
    initialScrollRatio,
    status,
    error,
    progress,
    minutesLeft,
    openBook,
    goToChapter,
  }
}
