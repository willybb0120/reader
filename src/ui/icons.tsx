interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export function ListIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

export function CloseIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function TranslateIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 5h9M7.5 3v2M5 5c.6 3 2.8 5.6 6 7M10 5c-.6 3-2.8 5.6-6 7" />
      <path d="M12.5 21l4-10 4 10M14 17.5h5" />
    </svg>
  )
}

export function TypeIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 7V5h11v2M9.5 5v14M7 19h5" />
      <path d="M14.5 12v-1H21v1M17.5 11v8M16 19h3" />
    </svg>
  )
}

export function HighlightIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20h16" />
      <path d="M9 16l-3 .8.8-3 7.6-7.6a1.6 1.6 0 0 1 2.3 0l.1.1a1.6 1.6 0 0 1 0 2.3z" />
    </svg>
  )
}

export function SearchIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

export function LibraryIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 5.5h5.5v13H4zM10.5 5.5H16v13h-5.5z" />
      <path d="M17.4 6.2l2.6.7-3.1 11.6-2.6-.7" />
    </svg>
  )
}

export function PlayIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 4.8l11 7.2-11 7.2z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PauseIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 5v14M16 5v14" strokeWidth={2.2} />
    </svg>
  )
}

export function PreviousIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17 6l-8 6 8 6zM6 5v14" />
    </svg>
  )
}

export function NextIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 6l8 6-8 6zM18 5v14" />
    </svg>
  )
}
