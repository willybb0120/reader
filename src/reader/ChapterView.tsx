import type { ChapterViewProps } from './chapterTypes'
import { PagedChapter } from './PagedChapter'

/** 依設定選擇版面：橫向分頁或直式滾動。 */
export function ChapterView(props: ChapterViewProps & { scroll: boolean }) {
  const { scroll, ...rest } = props
  // ScrollChapter 在 Task 5 接上，先一律走分頁
  void scroll
  return <PagedChapter {...rest} />
}
