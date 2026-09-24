import { useLayoutEffect, useRef, useState } from 'react'
import { COLORS, type Color } from '../store/annotations'
import { computeToolbarPosition, type ToolbarPosition } from './toolbarPosition'

interface SelectionToolbarProps {
  /** 取得目前的定位依據：選取用目前的 Range，標註用對應的 <mark> 元素；沒有時回傳 null。 */
  rectOf: () => DOMRect | null
  /**
   * 量測目標的識別：選取用起訖字元位移組字串，標註用 id。用來判斷「是不是換了新的目標」，
   * 不能直接拿 rectOf 的物件識別當依據——拖曳選取時 App 端每次 debounce 後都會產生新的
   * TextSelection 物件，rectOf（依 [active, selection] 建立的 useCallback）的識別也跟著
   * 每次都變；若拿 rectOf 的識別來重設遲滯方向，拖曳中遲滯帶狀態會一直被清掉，
   * 門檻附近的抖動又跑回來。
   */
  targetKey: string | null
  /**
   * 任何跟排版有關、可能讓 rectOf 的量測結果整個失效的訊號（例如分頁／滾動模式切換）。
   * SelectionToolbar 本身不會隨 ChapterView 卸載重掛，rectOf 的識別在切換模式時也不會變，
   * 所以光靠 [rectOf] 這個相依偵測不到「該重新量一次」；把訊號傳進來讓它變化時立刻重算一次，
   * 不必等到下一次捲動或視窗尺寸改變才發現量到的東西已經不對。
   */
  resyncSignal?: unknown
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
  rectOf,
  targetKey,
  resyncSignal,
  existing,
  onHighlight,
  onNote,
  onCopy,
  onRemove,
}: SelectionToolbarProps) {
  const [position, setPosition] = useState<ToolbarPosition | null>(null)
  // 記住目前浮在上方還是下方，給 computeToolbarPosition 做遲滯判斷，
  // 避免捲動時 rect.top 在 96px 門檻附近來回就一直翻面
  const aboveRef = useRef<boolean | null>(null)
  // 上一次看到的目標識別，只有它真的變了才重設遲滯方向（見 targetKey 的註解）
  const targetKeyRef = useRef<string | null>(null)

  // 工具列自己追蹤位置，而不是吃呼叫端量到的一次性 rect：捲動與視窗尺寸改變時都要重算，
  // 否則滾動模式下選取的文字一動，工具列就停在原地跟丟了。用 rAF 收斂，不是每個事件都重排。
  useLayoutEffect(() => {
    // 換了新的量測目標（新選取／新標註）：方向重新判斷，不沿用上一個目標留下的遲滯狀態。
    // 用 targetKey 而不是這個 effect 本身有沒有重跑來判斷，因為 effect 會因為 rectOf／
    // resyncSignal 改變而重跑，但那不代表目標真的換了（見上面 targetKey 的註解）。
    if (targetKeyRef.current !== targetKey) {
      targetKeyRef.current = targetKey
      aboveRef.current = null
    }

    let frame = 0
    const recompute = () => {
      frame = 0
      const rect = rectOf()
      const position = rect
        ? computeToolbarPosition(rect, window.innerWidth, window.innerHeight, aboveRef.current)
        : null
      // rect 消失或完全捲出可視範圍都重置方向記憶，下次重新出現時用門檻直接判斷，
      // 不要沿用消失前的遲滯狀態
      aboveRef.current = position ? position.above : null
      setPosition(position)
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(recompute)
    }

    recompute()

    // 滾動模式的捲動容器是 .pager--scroll，且切換分頁／滾動會把它整個卸載重掛，
    // 若在這裡查一次容器存起來，模式切換時這個 effect 不會重跑（rectOf 沒變），
    // 存的參照就會指向舊容器或 null，之後捲動再也偵測不到。
    // scroll 事件不會冒泡，但 capture 監聽在 document 上能收到任何後代元素目前的捲動事件，
    // 不管當下的捲動容器是哪個、或是不是剛剛才掛上去的，不必自己追蹤容器的存在與否。
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [rectOf, resyncSignal, targetKey])

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
