import { COLORS, type Color } from '../store/annotations'

interface SelectionToolbarProps {
  rect: DOMRect
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

export function SelectionToolbar({
  rect,
  existing,
  onHighlight,
  onNote,
  onCopy,
  onRemove,
}: SelectionToolbarProps) {
  // 預設浮在選取範圍上方；太靠近視窗頂端時改放下方，並確保不會被推出畫面
  const above = rect.top > 96
  const rawTop = above ? rect.top - 12 : rect.bottom + 12
  const top = Math.min(Math.max(rawTop, above ? 96 : 60), window.innerHeight - 24)
  const style = {
    top: `${top}px`,
    left: `${Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140)}px`,
    transform: `translate(-50%, ${above ? '-100%' : '0'})`,
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
