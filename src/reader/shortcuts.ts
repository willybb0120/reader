export type ShortcutAction =
  | 'prevChapter'
  | 'nextChapter'
  | 'toc'
  | 'search'
  | 'annotations'
  | 'settings'
  | 'library'
  | 'help'
  | 'fontUp'
  | 'fontDown'
  | 'cycleTheme'
  | 'close'

const BY_KEY: Record<string, ShortcutAction> = {
  arrowleft: 'prevChapter',
  arrowright: 'nextChapter',
  t: 'toc',
  f: 'search',
  '/': 'search',
  h: 'annotations',
  a: 'settings',
  l: 'library',
  '?': 'help',
  '=': 'fontUp',
  '+': 'fontUp',
  '-': 'fontDown',
  _: 'fontDown',
  d: 'cycleTheme',
}

/** 供說明面板顯示的快捷鍵一覽。 */
export const SHORTCUT_HELP: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: '← / →', description: '上一節 / 下一節' },
  { keys: 'T', description: '目錄' },
  { keys: 'F 或 /', description: '搜尋全書' },
  { keys: 'H', description: '劃線與筆記' },
  { keys: 'A', description: '閱讀設定' },
  { keys: 'L', description: '回到書櫃' },
  { keys: '+ / -', description: '放大 / 縮小字級' },
  { keys: 'D', description: '切換主題' },
  { keys: '?', description: '這份說明' },
  { keys: 'Esc', description: '關閉面板' },
]

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * 把鍵盤事件對應到動作。
 * 帶修飾鍵或正在輸入時一律不攔截，避免搶走瀏覽器與輸入法的行為。
 */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (event.key === 'Escape') return 'close'
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (isTextEntry(event.target)) return null
  return BY_KEY[event.key.toLowerCase()] ?? null
}
