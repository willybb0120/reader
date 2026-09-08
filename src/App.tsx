import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChapterView, type TextSelection } from './reader/ChapterView'
import { SelectionToolbar } from './reader/SelectionToolbar'
import { useBook } from './reader/useBook'
import { useAnnotations } from './reader/useAnnotations'
import { toMarkdown, type Annotation, type Color } from './store/annotations'
import { useSettings } from './store/useSettings'
import { AnnotationsPanel } from './ui/AnnotationsPanel'
import { NoteDialog } from './ui/NoteDialog'
import { SettingsPanel } from './ui/SettingsPanel'
import { Toc } from './ui/Toc'
import { HighlightIcon, ListIcon, TypeIcon } from './ui/icons'

type Panel = 'toc' | 'settings' | 'annotations' | null

export function App() {
  const {
    book,
    bookId,
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
  const { settings, update: updateSettings } = useSettings()
  const { annotations, byChapter, add, update, remove } = useAnnotations(bookId)

  const [panel, setPanel] = useState<Panel>(null)
  const [scrolled, setScrolled] = useState(false)
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [active, setActive] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [editingNote, setEditingNote] = useState<Annotation | null>(null)
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | undefined>()

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
      void goToChapter(index, target)
    },
    [goToChapter],
  )

  useEffect(() => {
    if (!chapter) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.tagName === 'TEXTAREA') return
      if (event.key === 'ArrowLeft') navigate(chapter.index - 1)
      if (event.key === 'ArrowRight') navigate(chapter.index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [chapter, navigate])

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

  const openAnnotation = (annotation: Annotation) => {
    setPanel(null)
    setFocusAnnotationId(annotation.id)
    if (annotation.chapterIndex !== chapter?.index) {
      void goToChapter(annotation.chapterIndex)
    }
  }

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void openBook(() => file.arrayBuffer())
  }

  const toolbarRect = active?.rect ?? selection?.rect

  return (
    <div className="app">
      <header className="topbar" data-scrolled={scrolled}>
        <button
          className="icon-button"
          onClick={() => setPanel('toc')}
          aria-label="開啟目錄"
          aria-pressed={panel === 'toc'}
          disabled={!book}
        >
          <ListIcon />
        </button>
        <div className="topbar__title">{chapter?.title ?? book?.metadata.title ?? '閱讀器'}</div>
        <button
          className="icon-button"
          onClick={() => setPanel('annotations')}
          aria-label="劃線與筆記"
          aria-pressed={panel === 'annotations'}
          disabled={!book}
        >
          <HighlightIcon />
        </button>
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
            annotations={chapterAnnotations}
            onNavigate={navigate}
            onSelect={onSelect}
            onAnnotationClick={onAnnotationClick}
            scrollToFragment={fragment}
            initialScrollRatio={initialScrollRatio}
            focusAnnotationId={focusAnnotationId}
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

      {panel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
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
