import { useEffect } from 'react'
import { LIMITS, type Settings, type Theme, type FontChoice } from '../store/settings'
import { CloseIcon } from './icons'

interface SettingsPanelProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const THEME_LABELS: Record<Theme, string> = {
  light: '紙白',
  sepia: '米黃',
  dark: '夜間',
}

const FONT_LABELS: Record<FontChoice, string> = {
  serif: '明體',
  sans: '黑體',
}

interface SliderProps {
  label: string
  value: number
  range: readonly [number, number]
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

function Slider({ label, value, range, step, format, onChange }: SliderProps) {
  return (
    <label className="setting">
      <span className="setting__label">
        {label}
        <span className="setting__value">{format(value)}</span>
      </span>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer drawer--right" role="dialog" aria-label="閱讀設定">
        <div className="drawer__header">
          <h2>閱讀設定</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉設定">
            <CloseIcon />
          </button>
        </div>

        <div className="settings">
          <div className="setting">
            <span className="setting__label">主題</span>
            <div className="segmented">
              {(Object.keys(THEME_LABELS) as Theme[]).map((theme) => (
                <button
                  key={theme}
                  data-theme-swatch={theme}
                  aria-pressed={settings.theme === theme}
                  onClick={() => onChange({ theme })}
                >
                  {THEME_LABELS[theme]}
                </button>
              ))}
            </div>
          </div>

          <div className="setting">
            <span className="setting__label">字體</span>
            <div className="segmented">
              {(Object.keys(FONT_LABELS) as FontChoice[]).map((font) => (
                <button
                  key={font}
                  aria-pressed={settings.font === font}
                  onClick={() => onChange({ font })}
                  style={{ fontFamily: font === 'serif' ? 'var(--serif)' : 'var(--sans)' }}
                >
                  {FONT_LABELS[font]}
                </button>
              ))}
            </div>
          </div>

          <Slider
            label="字級"
            value={settings.fontSize}
            range={LIMITS.fontSize}
            step={1}
            format={(v) => `${v}px`}
            onChange={(fontSize) => onChange({ fontSize })}
          />
          <Slider
            label="行高"
            value={settings.lineHeight}
            range={LIMITS.lineHeight}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(lineHeight) => onChange({ lineHeight })}
          />
          <Slider
            label="字距"
            value={settings.letterSpacing}
            range={LIMITS.letterSpacing}
            step={0.01}
            format={(v) => `${v.toFixed(2)}em`}
            onChange={(letterSpacing) => onChange({ letterSpacing })}
          />
          <Slider
            label="欄寬"
            value={settings.readingWidth}
            range={LIMITS.readingWidth}
            step={1}
            format={(v) => `${v}rem`}
            onChange={(readingWidth) => onChange({ readingWidth })}
          />

          <label className="setting setting--row">
            <span className="setting__label">兩端對齊</span>
            <input
              type="checkbox"
              checked={settings.justify}
              onChange={(event) => onChange({ justify: event.target.checked })}
            />
          </label>
        </div>
      </div>
    </>
  )
}
