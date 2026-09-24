import type { ChapterViewProps } from './chapterTypes'
import { PagedChapter } from './PagedChapter'
import { ScrollChapter } from './ScrollChapter'

/** 依設定選擇版面：橫向分頁或直式滾動。 */
export function ChapterView({ scroll, ...props }: ChapterViewProps & { scroll: boolean }) {
  return scroll ? <ScrollChapter {...props} /> : <PagedChapter {...props} />
}
