import { useEffect, useState } from 'react'
import { ChapterView } from './reader/ChapterView'
import { useBook } from './reader/useBook'
import { Toc } from './ui/Toc'
import { SettingsPanel } from './ui/SettingsPanel'
import { useSettings } from './store/useSettings'
import { ListIcon, TypeIcon } from './ui/icons'

export function App() {
  const {
    book,
    chapter,
    fragment,
    initialScrollRatio,
    status,
    error,
    progress,
    minutesLeft,
    openBook,
    goToChapter,
  } = useBook()
  const { settings, update } = useSettings()
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!chapter) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return
      if (event.key === 'ArrowLeft') void goToChapter(chapter.index - 1)
      if (event.key === 'ArrowRight') void goToChapter(chapter.index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [chapter, goToChapter])

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void openBook(() => file.arrayBuffer())
  }

  const navigate = (index: number, target?: string) => {
    setTocOpen(false)
    void goToChapter(index, target)
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
        {status === 'ready' && (
          <div
            className="topbar__progress"
            style={{ transform: `scaleX(${progress})` }}
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-label="閱讀進度"
          />
        )}
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
          <ChapterView
            chapter={chapter}
            onNavigate={navigate}
            scrollToFragment={fragment}
            initialScrollRatio={initialScrollRatio}
          />
          <nav className="chapter-nav">
            <button onClick={() => navigate(chapter.index - 1)} disabled={chapter.index === 0}>
              ← 上一節
            </button>
            <span className="chapter-nav__position">
              {Math.round(progress * 100)}%
              {minutesLeft !== null && ` · 剩餘約 ${minutesLeft} 分鐘`}
            </span>
            <button
              onClick={() => navigate(chapter.index + 1)}
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
          onSelect={navigate}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  )
}
