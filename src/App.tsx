import { useCallback, useEffect, useRef, useState } from 'react'
import { bundledBooks } from 'virtual:books'
import { parseEpub, type Book, type Chapter } from './epub/parseEpub'
import { ChapterView } from './reader/ChapterView'
import { withTrimmedImages } from './reader/trimImages'
import { Toc } from './ui/Toc'
import { SettingsPanel } from './ui/SettingsPanel'
import { useSettings } from './store/useSettings'
import { ListIcon, TypeIcon } from './ui/icons'

type Status = 'idle' | 'loading' | 'ready' | 'error'

async function prepare(chapter: Chapter): Promise<Chapter> {
  return { ...chapter, html: await withTrimmedImages(chapter.html) }
}

export function App() {
  const [book, setBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [fragment, setFragment] = useState<string | undefined>()
  const [status, setStatus] = useState<Status>(bundledBooks.length > 0 ? 'loading' : 'idle')
  const [error, setError] = useState('')
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { settings, update } = useSettings()
  const [scrolled, setScrolled] = useState(false)
  const bookRef = useRef<Book | null>(null)

  const openBook = useCallback(async (load: () => Promise<ArrayBuffer>) => {
    setStatus('loading')
    setError('')
    try {
      const parsed = await parseEpub(await load())
      bookRef.current?.dispose()
      bookRef.current = parsed
      setBook(parsed)
      setChapter(await prepare(await parsed.getChapter(0)))
      setFragment(undefined)
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goToChapter = useCallback(
    async (index: number, targetFragment?: string) => {
      const current = bookRef.current
      if (!current || index < 0 || index >= current.spine.length) return
      setChapter(await prepare(await current.getChapter(index)))
      setFragment(targetFragment)
      setTocOpen(false)
    },
    [],
  )

  useEffect(() => {
    if (!book || !chapter) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return
      if (event.key === 'ArrowLeft') void goToChapter(chapter.index - 1)
      if (event.key === 'ArrowRight') void goToChapter(chapter.index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [book, chapter, goToChapter])

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void openBook(() => file.arrayBuffer())
  }

  return (
    <div className="app">
      <header className="topbar" data-scrolled={scrolled}>
        <button
          className="icon-button"
          onClick={() => setTocOpen(true)}
          aria-label="開啟目錄"
          aria-pressed={tocOpen}
          disabled={!book}
        >
          <ListIcon />
        </button>
        <div className="topbar__title">{chapter?.title ?? book?.metadata.title ?? '閱讀器'}</div>
        <button
          className="icon-button"
          onClick={() => setSettingsOpen(true)}
          aria-label="閱讀設定"
          aria-pressed={settingsOpen}
        >
          <TypeIcon />
        </button>
      </header>

      {status === 'loading' && (
        <div className="state">
          <div className="spinner" />
          <p>載入中…</p>
        </div>
      )}

      {(status === 'idle' || status === 'error') && (
        <div className="state">
          <h1>選一本書開始閱讀</h1>
          <p>
            支援 EPUB 檔案。也可以把書放進 <code>public/books/</code>，重新整理即自動開啟。
          </p>
          {error && <div className="state__error">{error}</div>}
          <label className="file-button">
            選擇 EPUB
            <input type="file" accept=".epub" hidden onChange={onPickFile} />
          </label>
        </div>
      )}

      {status === 'ready' && book && chapter && (
        <main className="reader">
          <ChapterView chapter={chapter} onNavigate={goToChapter} scrollToFragment={fragment} />
          <nav className="chapter-nav">
            <button onClick={() => void goToChapter(chapter.index - 1)} disabled={chapter.index === 0}>
              ← 上一節
            </button>
            <button
              onClick={() => void goToChapter(chapter.index + 1)}
              disabled={chapter.index >= book.spine.length - 1}
            >
              下一節 →
            </button>
          </nav>
        </main>
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={update}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {tocOpen && book && (
        <Toc
          nav={book.nav}
          currentChapter={chapter?.index ?? 0}
          onSelect={(index, target) => void goToChapter(index, target)}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  )
}
