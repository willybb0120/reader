import { useEffect, useMemo } from 'react'
import type { BookRecord } from '../store/library'

/** 沒有封面的書依書名配一個固定的顏色，同一本書每次都一樣 */
const BLANK_COLORS = ['#2f3e46', '#9a6b3f', '#3d5a80', '#5b4b8a', '#2a9d8f', '#264653', '#b5838d', '#6d6875']

function colorFor(title: string): string {
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return BLANK_COLORS[hash % BLANK_COLORS.length]
}

export function CoverImage({ book }: { book: BookRecord }) {
  const url = useMemo(
    () => (book.cover ? URL.createObjectURL(new Blob([book.cover.data], { type: book.cover.type })) : null),
    [book],
  )
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  if (!url) {
    return (
      <span
        className="book-card__cover book-card__cover--blank"
        style={{ '--blank': colorFor(book.title) } as React.CSSProperties}
      >
        <span className="book-card__blank-title">{book.title}</span>
        {book.creator && <span className="book-card__blank-creator">{book.creator}</span>}
      </span>
    )
  }
  return <img className="book-card__cover" src={url} alt="" draggable={false} />
}
