import { useMemo, useState } from 'react'
import type { BookRecord } from '../store/library'
import { BookCarousel } from './BookCarousel'
import { filterBooks } from './carousel'

interface LibraryProps {
  books: BookRecord[] | null
  error: string
  onOpen: (id: string) => void
  onImport: (files: readonly File[]) => void
  onRemove: (id: string) => void
}

export function Library({ books, error, onOpen, onImport, onRemove }: LibraryProps) {
  const [dragging, setDragging] = useState(false)
  const [query, setQuery] = useState('')
  // 搜尋結果要記住識別，否則每次重繪都是新陣列，轉盤會被重設回第一本
  const shown = useMemo(() => (books ? filterBooks(books, query) : []), [books, query])

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

      {books && books.length > 1 && (
        <div className="library__search">
          <input
            type="search"
            value={query}
            placeholder="搜尋書名或作者"
            aria-label="搜尋書櫃"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
          />
          {query.trim() && <span className="library__count">{shown.length} 本</span>}
        </div>
      )}

      {books && books.length > 0 && shown.length === 0 && (
        <p className="library__empty">找不到符合「{query.trim()}」的書</p>
      )}

      {shown.length > 0 && <BookCarousel books={shown} onOpen={onOpen} onRemove={onRemove} />}
    </div>
  )
}
