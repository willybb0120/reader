import { useEffect, useRef } from 'react'
import type { NavItem } from '../epub/parseEpub'
import { CloseIcon } from './icons'

interface TocProps {
  nav: NavItem[]
  currentChapter: number
  onSelect: (chapterIndex: number, fragment?: string) => void
  onClose: () => void
}

interface FlatItem {
  item: NavItem
  depth: number
}

function flatten(items: NavItem[], depth = 0): FlatItem[] {
  return items.flatMap((item) => [{ item, depth }, ...flatten(item.children, depth + 1)])
}

export function Toc({ nav, currentChapter, onSelect, onClose }: TocProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const flat = flatten(nav)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({
      block: 'center',
    })
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" ref={panelRef} role="dialog" aria-label="目錄">
        <div className="drawer__header">
          <h2>目錄</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉目錄">
            <CloseIcon />
          </button>
        </div>
        <nav className="toc">
          {flat.map(({ item, depth }, index) => (
            <button
              key={`${item.chapterIndex}-${item.fragment ?? ''}-${index}`}
              className="toc__item"
              data-depth={Math.min(depth, 1)}
              aria-current={item.chapterIndex === currentChapter && depth === 0}
              onClick={() => onSelect(item.chapterIndex, item.fragment)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}
