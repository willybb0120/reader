import { useEffect, useRef } from 'react'
import type { Chapter } from '../epub/parseEpub'

interface ChapterViewProps {
  chapter: Chapter
  /** 章內或跨章連結被點擊 */
  onNavigate: (chapterIndex: number, fragment?: string) => void
  /** 進入章節後要捲到的錨點 */
  scrollToFragment?: string
}

export function ChapterView({ chapter, onNavigate, scrollToFragment }: ChapterViewProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a[data-chapter]')
      if (!anchor) return
      event.preventDefault()
      onNavigate(
        Number(anchor.getAttribute('data-chapter')),
        anchor.getAttribute('data-fragment') ?? undefined,
      )
    }

    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [onNavigate])

  useEffect(() => {
    const container = ref.current
    if (!container) return
    if (scrollToFragment) {
      const target = container.querySelector(`#${CSS.escape(scrollToFragment)}`)
      if (target) {
        target.scrollIntoView({ block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0 })
  }, [chapter.index, scrollToFragment])

  return (
    <article
      className="chapter"
      ref={ref}
      lang="zh-TW"
      dangerouslySetInnerHTML={{ __html: chapter.html }}
    />
  )
}
