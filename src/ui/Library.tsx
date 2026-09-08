import { useEffect, useMemo, useState } from 'react'
import type { BookRecord } from '../store/library'
import { loadProgress } from '../store/progress'

interface LibraryProps {
  books: BookRecord[] | null
  error: string
  onOpen: (id: string) => void
  onImport: (files: readonly File[]) => void
  onRemove: (id: string) => void
}

function CoverImage({ book }: { book: BookRecord }) {
  const url = useMemo(
    () => (book.cover ? URL.createObjectURL(new Blob([book.cover.data], { type: book.cover.type })) : null),
    [book],
  )
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  if (!url) return <div className="book-card__cover book-card__cover--blank">{book.title}</div>
  return <img className="book-card__cover" src={url} alt="" />
}

export function Library({ books, error, onOpen, onImport, onRemove }: LibraryProps) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="library"
      data-dragging={dragging}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        onImport([...event.dataTransfer.files])
      }}
    >
      <header className="library__header">
        <h1>書櫃</h1>
        <label className="file-button">
          加入 EPUB
          <input
            type="file"
            accept=".epub"
            multiple
            hidden
            onChange={(event) => onImport([...(event.target.files ?? [])])}
          />
        </label>
      </header>

      {error && <div className="state__error">{error}</div>}

      {books === null && <div className="spinner" />}

      {books?.length === 0 && (
        <p className="library__empty">
          還沒有書。把 EPUB 檔拖進這個畫面，或按右上角加入。
        </p>
      )}

      {books && books.length > 0 && (
        <div className="library__grid">
          {books.map((book) => {
            const percent = Math.round((loadProgress(book.id)?.overall ?? 0) * 100)
            return (
              <div key={book.id} className="book-card">
                <button className="book-card__open" onClick={() => onOpen(book.id)}>
                  <span className="book-card__frame">
                    <CoverImage book={book} />
                    {percent > 0 && <span className="book-card__progress">{percent}%</span>}
                  </span>
                  <span className="book-card__title">{book.title}</span>
                  {book.creator && <span className="book-card__creator">{book.creator}</span>}
                </button>
                <button
                  className="book-card__remove"
                  onClick={() => onRemove(book.id)}
                  aria-label={`從書櫃移除 ${book.title}`}
                >
                  移除
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
