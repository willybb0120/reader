import { useLayoutEffect, useState } from 'react'
import { COLORS, type Color } from '../store/annotations'
import { computeToolbarPosition, type ToolbarPosition } from './toolbarPosition'

interface SelectionToolbarProps {
  /** 取得目前的定位依據：選取用目前的 Range，標註用對應的 <mark> 元素；沒有時回傳 null。 */
  rectOf: () => DOMRect | null
  /** 已存在的標註才顯示筆記與刪除 */
  existing?: { color: Color; note?: string }
  onHighlight: (color: Color) => void
  onNote: () => void
  onCopy: () => void
  onRemove?: () => void
}

const COLOR_LABELS: Record<Color, string> = {
  yellow: '黃',
  green: '綠',
  blue: '藍',
  pink: '粉',
}

function measure(rectOf: () => DOMRect | null): ToolbarPosition | null {
  const rect = rectOf()
  return rect ? computeToolbarPosition(rect, window.innerWidth, window.innerHeight) : null
}

export function SelectionToolbar({
  rectOf,
  existing,
  onHighlight,
  onNote,
  onCopy,
  onRemove,
}: SelectionToolbarProps) {
  const [position, setPosition] = useState<ToolbarPosition | null>(() => measure(rectOf))

  // 工具列自己追蹤位置，而不是吃呼叫端量到的一次性 rect：捲動與視窗尺寸改變時都要重算，
  // 否則滾動模式下選取的文字一動，工具列就停在原地跟丟了。用 rAF 收斂，不是每個 scroll 事件都重排。
  useLayoutEffect(() => {
    let frame = 0
    const recompute = () => {
      frame = 0
      setPosition(measure(rectOf))
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(recompute)
    }

    recompute()

    // 滾動模式的捲動容器是 .pager--scroll；scroll 事件不會冒泡到 window，要直接綁在會捲動的元素上。
    // 分頁模式沒有這個容器，這裡就只靠 resize 監聽，行為與改動前一致。
    const scrollContainer = document.querySelector('.pager--scroll')
    scrollContainer?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      scrollContainer?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [rectOf])

  // rect 消失（選取清空、標註被刪）或完全捲出可視範圍時，工具列要隱藏
  if (!position) return null

  const style = {
    top: `${position.top}px`,
    left: `${position.left}px`,
    transform: `translate(-50%, ${position.above ? '-100%' : '0'})`,
  }

  return (
    <div className="selection-toolbar" style={style} role="toolbar" aria-label="標註工具">
      {COLORS.map((color) => (
        <button
          key={color}
          className="swatch"
          data-color={color}
          aria-label={`${COLOR_LABELS[color]}色劃線`}
          aria-pressed={existing?.color === color}
          onClick={() => onHighlight(color)}
        />
      ))}
      <span className="selection-toolbar__divider" />
      <button onClick={onNote}>{existing?.note ? '編輯筆記' : '筆記'}</button>
      <button onClick={onCopy}>複製</button>
      {onRemove && <button onClick={onRemove}>刪除</button>}
    </div>
  )
}
