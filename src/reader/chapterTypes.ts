import type { Chapter } from '../epub/parseEpub'
import type { Annotation } from '../store/annotations'

export interface TextSelection {
  start: number
  end: number
  text: string
}

/** 進入章節時要停在哪裡 */
export type EntryTarget =
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'offset'; offset: number }
  | { kind: 'fragment'; id: string }
  | { kind: 'annotation'; id: string }

/**
 * slide 指定新章節要從哪一側滑進來。
 * 換章時頁碼會歸零或跳到章尾，位移量與翻頁方向無關，
 * 所以得另外指定方向，否則動畫會往反方向跑。
 */
export type Entry = EntryTarget & { slide?: 'forward' | 'backward' }

export interface PagerApi {
  turn: (delta: number) => void
  /** 確保這個字元位移落在目前這一頁，不在就翻過去 */
  reveal: (offset: number) => void
}

export interface ChapterViewProps {
  chapter: Chapter
  annotations: Annotation[]
  entry: Entry
  /** 排版設定的指紋，改變時重新分頁 */
  layoutKey: string
  /** 搜尋命中的範圍，會另外標示 */
  highlightRange?: { start: number; end: number }
  /** 正在朗讀的句子範圍 */
  speakingRange?: { start: number; end: number }
  /** 讓外部（鍵盤快捷鍵）也能翻頁 */
  pagerRef: React.RefObject<PagerApi | null>
  onNavigate: (chapterIndex: number, fragment?: string) => void
  onSelect: (selection: TextSelection | null) => void
  onAnnotationClick: (id: string) => void
  /** 已在最後一頁還要往下翻 */
  onPastEnd: () => void
  /** 已在第一頁還要往回翻 */
  onPastStart: () => void
  /** 目前頁面起始位置改變，回報給進度記錄 */
  onPositionChange: (charOffset: number, chapterLength: number) => void
  /** 使用者自己翻頁（不含朗讀或搜尋造成的跳頁） */
  onUserTurn?: (charOffset: number) => void
}
