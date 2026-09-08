import { useCallback, useEffect, useMemo, useState } from 'react'
import { Library } from './ui/Library'
import { useLibrary } from './reader/useLibrary'
import { ChapterView, type TextSelection } from './reader/ChapterView'
import { SelectionToolbar } from './reader/SelectionToolbar'
import { useBook } from './reader/useBook'
import { useAnnotations } from './reader/useAnnotations'
import { toMarkdown, type Annotation, type Color } from './store/annotations'
import { useSettings } from './store/useSettings'
import { AnnotationsPanel } from './ui/AnnotationsPanel'
import { NoteDialog } from './ui/NoteDialog'
import { SettingsPanel } from './ui/SettingsPanel'
import { SearchPanel } from './ui/SearchPanel'
import { Toc } from './ui/Toc'
import { HelpDialog } from './ui/HelpDialog'
import { matchShortcut } from './reader/shortcuts'
import { LIMITS, type Theme } from './store/settings'
import { HighlightIcon, LibraryIcon, ListIcon, SearchIcon, TypeIcon } from './ui/icons'
import type { SearchHit } from './reader/search'

type Panel = 'toc' | 'search' | 'settings' | 'annotations' | null

const LAST_BOOK_KEY = 'reader:last-book'

export function App() {
  const [bookId, setBookId] = useState<string | null>(
    () => localStorage.getItem(LAST_BOOK_KEY) ?? null,
  )
  const library = useLibrary()
  const {
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
  } = useBook(bookId)
  const { settings, update: updateSettings } = useSettings()
  const { annotations, byChapter, add, update, remove } = useAnnotations(bookId ?? '')

  const [panel, setPanel] = useState<Panel>(null)
  const [scrolled, setScrolled] = useState(false)
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [active, setActive] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [editingNote, setEditingNote] = useState<Annotation | null>(null)
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | undefined>()
  const [focusRange, setFocusRange] = useState<{ start: number; end: number } | undefined>()
  const [helpOpen, setHelpOpen] = useState(false)

  const chapterAnnotations = useMemo(
    () => (chapter ? (byChapter.get(chapter.index) ?? []) : []),
    [byChapter, chapter],
  )
  const activeAnnotation = annotations.find((item) => item.id === active?.id)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navigate = useCallback(
    (index: number, target?: string) => {
      setPanel(null)
      setFocusAnnotationId(undefined)
      setFocusRange(undefined)
      void goToChapter(index, target)
    },
    [goToChapter],
  )

  // 沒有相依陣列：快捷鍵要讀到最新的章節與設定，每次渲染重新掛載最單純
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = matchShortcut(event)
      if (!action) return

      switch (action) {
        case 'close':
          setPanel(null)
          setHelpOpen(false)
          return
        case 'help':
          setHelpOpen(true)
          break
        case 'settings':
          setPanel((current) => (current === 'settings' ? null : 'settings'))
          break
        case 'fontUp':
        case 'fontDown': {
          const [min, max] = LIMITS.fontSize
          const next = settings.fontSize + (action === 'fontUp' ? 1 : -1)
          updateSettings({ fontSize: Math.min(max, Math.max(min, next)) })
          break
        }
        case 'cycleTheme': {
          const order: Theme[] = ['light', 'sepia', 'dark']
          const next = order[(order.indexOf(settings.theme) + 1) % order.length]
          updateSettings({ theme: next })
          break
        }
        default:
          if (!chapter) return
          if (action === 'prevChapter') navigate(chapter.index - 1)
          else if (action === 'nextChapter') navigate(chapter.index + 1)
          else if (action === 'library') closeBook()
          else if (action === 'toc') setPanel((c) => (c === 'toc' ? null : 'toc'))
          else if (action === 'search') setPanel((c) => (c === 'search' ? null : 'search'))
          else if (action === 'annotations')
            setPanel((c) => (c === 'annotations' ? null : 'annotations'))
      }
      event.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const onSelect = useCallback((next: TextSelection | null) => {
    setSelection(next)
    if (next) setActive(null)
  }, [])

  const onAnnotationClick = useCallback((id: string, rect: DOMRect) => {
    setSelection(null)
    setActive({ id, rect })
  }, [])

  const highlight = (color: Color) => {
    if (activeAnnotation) {
      update(activeAnnotation.id, { color })
      setActive(null)
      return
    }
    if (!selection || !chapter) return
    add({
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
      start: selection.start,
      end: selection.end,
      text: selection.text,
      color,
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const openNote = () => {
    if (activeAnnotation) {
      setEditingNote(activeAnnotation)
      setActive(null)
      return
    }
    if (!selection || !chapter) return
    const created = add({
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
      start: selection.start,
      end: selection.end,
      text: selection.text,
      color: 'yellow',
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    if (created) setEditingNote(created)
  }

  const copySelection = () => {
    const text = activeAnnotation?.text ?? selection?.text
    if (text) void navigator.clipboard?.writeText(text)
    setSelection(null)
    setActive(null)
  }

  const exportMarkdown = () => {
    if (!book) return
    const blob = new Blob([toMarkdown(book.metadata.title, annotations)], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${book.metadata.title} - 劃線筆記.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const openHit = (hit: SearchHit) => {
    setPanel(null)
    setFocusAnnotationId(undefined)
    setFocusRange({ start: hit.start, end: hit.end })
    if (hit.chapterIndex !== chapter?.index) void goToChapter(hit.chapterIndex)
  }

  const openAnnotation = (annotation: Annotation) => {
    setPanel(null)
    setFocusRange(undefined)
    setFocusAnnotationId(annotation.id)
    if (annotation.chapterIndex !== chapter?.index) {
      void goToChapter(annotation.chapterIndex)
    }
  }

  const openFromLibrary = (id: string) => {
    localStorage.setItem(LAST_BOOK_KEY, id)
    setBookId(id)
  }

  const closeBook = () => {
    localStorage.removeItem(LAST_BOOK_KEY)
    setBookId(null)
    void library.refresh()
  }

  const importFiles = (files: readonly File[]) => {
    void library.importFiles(files).then((id) => {
      if (id) openFromLibrary(id)
    })
  }

  const toolbarRect = active?.rect ?? selection?.rect

  return (
    <div className="app">
      <header className="topbar" data-scrolled={scrolled}>
        {book && (
          <>
            <button className="icon-button" onClick={closeBook} aria-label="回到書櫃">
              <LibraryIcon />
            </button>
            <button
              className="icon-button"
              onClick={() => setPanel('toc')}
              aria-label="開啟目錄"
              aria-pressed={panel === 'toc'}
            >
              <ListIcon />
            </button>
            <button
              className="icon-button"
              onClick={() => setPanel('search')}
              aria-label="搜尋全書"
              aria-pressed={panel === 'search'}
            >
              <SearchIcon />
            </button>
          </>
        )}
        <div className="topbar__title">{chapter?.title ?? book?.metadata.title ?? ''}</div>
        {book && (
          <button
            className="icon-button"
            onClick={() => setPanel('annotations')}
            aria-label="劃線與筆記"
            aria-pressed={panel === 'annotations'}
          >
            <HighlightIcon />
          </button>
        )}
        <button
          className="icon-button"
          onClick={() => setPanel('settings')}
          aria-label="閱讀設定"
          aria-pressed={panel === 'settings'}
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
        <Library
          books={library.books}
          error={error || library.error}
          onOpen={openFromLibrary}
          onImport={importFiles}
          onRemove={(id) => void library.remove(id)}
        />
      )}

      {status === 'ready' && book && chapter && (
        <main className="reader">
          <ChapterView
            chapter={chapter}
            annotations={chapterAnnotations}
            onNavigate={navigate}
            onSelect={onSelect}
            onAnnotationClick={onAnnotationClick}
            scrollToFragment={fragment}
            initialScrollRatio={initialScrollRatio}
            focusAnnotationId={focusAnnotationId}
            focusRange={focusRange}
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

      {toolbarRect && (
        <SelectionToolbar
          rect={toolbarRect}
          existing={activeAnnotation}
          onHighlight={highlight}
          onNote={openNote}
          onCopy={copySelection}
          onRemove={
            activeAnnotation
              ? () => {
                  remove(activeAnnotation.id)
                  setActive(null)
                }
              : undefined
          }
        />
      )}

      {editingNote && (
        <NoteDialog
          quote={editingNote.text}
          note={editingNote.note ?? ''}
          onSave={(note) => {
            update(editingNote.id, { note })
            setEditingNote(null)
          }}
          onClose={() => setEditingNote(null)}
        />
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {panel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onShowShortcuts={() => {
            setPanel(null)
            setHelpOpen(true)
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'annotations' && (
        <AnnotationsPanel
          annotations={annotations}
          onOpen={openAnnotation}
          onRemove={remove}
          onExport={exportMarkdown}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'search' && book && (
        <SearchPanel
          chapterTexts={chapterTexts}
          chapterTitle={(index) => chapterTitles[index] ?? `第 ${index + 1} 節`}
          onOpen={openHit}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'toc' && book && (
        <Toc
          nav={book.nav}
          currentChapter={chapter?.index ?? 0}
          onSelect={navigate}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
