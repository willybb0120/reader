import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings'

/** 讀取／保存閱讀設定，並把數值同步到 :root 的 CSS 變數。 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => setSettings(loadSettings()), [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = settings.theme
    root.dataset.font = settings.font
    root.style.setProperty('--font-size', `${settings.fontSize}px`)
    root.style.setProperty('--line-height', String(settings.lineHeight))
    root.style.setProperty('--reading-width', `${settings.readingWidth}rem`)
    root.style.setProperty('--letter-spacing', `${settings.letterSpacing}em`)
    root.style.setProperty('--text-align', settings.justify ? 'justify' : 'start')
  }, [settings])

  const update = (patch: Partial<Settings>) =>
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })

  return { settings, update }
}
