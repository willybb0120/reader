export type Theme = 'light' | 'sepia' | 'dark'
export type FontChoice = 'serif' | 'sans'

export interface Settings {
  theme: Theme
  font: FontChoice
  /** 內文字級（px） */
  fontSize: number
  lineHeight: number
  /** 閱讀欄寬（rem） */
  readingWidth: number
  /** 字距（em） */
  letterSpacing: number
  justify: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  font: 'serif',
  fontSize: 18,
  lineHeight: 2,
  readingWidth: 34,
  letterSpacing: 0,
  justify: true,
}

export const LIMITS = {
  fontSize: [14, 28],
  lineHeight: [1.4, 2.6],
  readingWidth: [26, 52],
  letterSpacing: [0, 0.16],
} as const satisfies Record<string, readonly [number, number]>

const STORAGE_KEY = 'reader:settings'
const THEMES: Theme[] = ['light', 'sepia', 'dark']
const FONTS: FontChoice[] = ['serif', 'sans']

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function normalize(raw: unknown): Settings {
  const input = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>
  return {
    theme: THEMES.includes(input.theme as Theme) ? (input.theme as Theme) : DEFAULT_SETTINGS.theme,
    font: FONTS.includes(input.font as FontChoice)
      ? (input.font as FontChoice)
      : DEFAULT_SETTINGS.font,
    fontSize: clamp(input.fontSize, LIMITS.fontSize, DEFAULT_SETTINGS.fontSize),
    lineHeight: clamp(input.lineHeight, LIMITS.lineHeight, DEFAULT_SETTINGS.lineHeight),
    readingWidth: clamp(input.readingWidth, LIMITS.readingWidth, DEFAULT_SETTINGS.readingWidth),
    letterSpacing: clamp(input.letterSpacing, LIMITS.letterSpacing, DEFAULT_SETTINGS.letterSpacing),
    justify: typeof input.justify === 'boolean' ? input.justify : DEFAULT_SETTINGS.justify,
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 私密瀏覽或配額用盡時忽略，設定僅在本次工作階段有效
  }
}
