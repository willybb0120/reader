import { useEffect, useRef } from 'react'
import type { Chapter } from '../epub/parseEpub'

interface ChapterViewProps {
  chapter: Chapter
  /** 章內或跨章連結被點擊 */
  onNavigate: (chapterIndex: number, fragment?: string) => void
  /** 進入章節後要捲到的錨點 */
  scrollToFragment?: string
  /** 進入章節後要還原的捲動比例（0-1） */
  initialScrollRatio?: number
}

export function ChapterView({
  chapter,
  onNavigate,
  scrollToFragment,
  initialScrollRatio = 0,
}: ChapterViewProps) {
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

    if (initialScrollRatio <= 0) {
      window.scrollTo({ top: 0 })
      return
    }

    // 圖片載入後版面高度才穩定，因此再補套用一次
    const apply = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: scrollable * initialScrollRatio })
    }
    apply()
    const timer = setTimeout(apply, 300)
    return () => clearTimeout(timer)
  }, [chapter.index, scrollToFragment, initialScrollRatio])

  return (
    <article
      className="chapter"
      ref={ref}
      lang="zh-TW"
      dangerouslySetInnerHTML={{ __html: chapter.html }}
    />
  )
}
