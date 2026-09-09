import type { Voice } from '../reader/speech'
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from './icons'

interface PlayerBarProps {
  supported: boolean
  playing: boolean
  percent: number
  rate: number
  voices: Voice[]
  voiceUri: string
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onRate: (rate: number) => void
  onVoice: (uri: string) => void
}

const RATES = [0.8, 1, 1.25, 1.5, 2]

export function PlayerBar({
  supported,
  playing,
  percent,
  rate,
  voices,
  voiceUri,
  onToggle,
  onPrevious,
  onNext,
  onRate,
  onVoice,
}: PlayerBarProps) {
  if (!supported) return <div className="pagebar">{percent}%</div>

  return (
    <div className="pagebar pagebar--player">
      <button
        className="icon-button"
        onClick={onToggle}
        aria-label={playing ? '暫停朗讀' : '開始朗讀'}
        aria-pressed={playing}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {playing && (
        <>
          <button className="icon-button" onClick={onPrevious} aria-label="上一句">
            <PreviousIcon size={16} />
          </button>
          <button className="icon-button" onClick={onNext} aria-label="下一句">
            <NextIcon size={16} />
          </button>

          <select
            className="pagebar__select"
            value={String(rate)}
            onChange={(event) => onRate(Number(event.target.value))}
            aria-label="朗讀速度"
          >
            {RATES.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>

          {voices.length > 0 && (
            <select
              className="pagebar__select pagebar__select--voice"
              value={voiceUri}
              onChange={(event) => onVoice(event.target.value)}
              aria-label="朗讀語音"
            >
              {voices.map((voice) => (
                <option key={voice.uri} value={voice.uri}>
                  {voice.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <span className="pagebar__percent">{percent}%</span>
    </div>
  )
}
