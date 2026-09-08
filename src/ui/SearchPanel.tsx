import { useEffect, useMemo, useRef, useState } from 'react'
import { searchChapters, type SearchHit } from '../reader/search'
import { CloseIcon } from './icons'

interface SearchPanelProps {
  chapterTexts: string[]
  chapterTitle: (chapterIndex: number) => string
  onOpen: (hit: SearchHit) => void
  onClose: () => void
}

export function SearchPanel({ chapterTexts, chapterTitle, onOpen, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const hits = useMemo(
    () => (query.trim().length > 0 ? searchChapters(chapterTexts, query, { limit: 100 }) : []),
    [chapterTexts, query],
  )

  const ready = chapterTexts.length > 0
  const trimmed = query.trim()

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="搜尋全書">
        <div className="drawer__header">
          <h2>搜尋</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉搜尋">
            <CloseIcon />
          </button>
        </div>

        <div className="search__field">
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={ready ? '搜尋全書…' : '正在整理內文…'}
            disabled={!ready}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜尋關鍵字"
          />
          {trimmed && (
            <span className="search__count">
              {hits.length}
              {hits.length >= 100 ? '+' : ''} 筆
            </span>
          )}
        </div>

        {trimmed && hits.length === 0 && ready && (
          <p className="drawer__empty">找不到「{trimmed}」。</p>
        )}

        <div className="search__results">
          {hits.map((hit) => (
            <button
              key={`${hit.chapterIndex}-${hit.start}`}
              className="search__hit"
              onClick={() => onOpen(hit)}
            >
              <span className="search__hit-chapter">{chapterTitle(hit.chapterIndex)}</span>
              <span className="search__hit-text">
                …{hit.before}
                <em>{hit.match}</em>
                {hit.after}…
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
