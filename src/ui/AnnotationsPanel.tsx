import { useEffect } from 'react'
import type { Annotation } from '../store/annotations'
import { CloseIcon } from './icons'

interface AnnotationsPanelProps {
  annotations: Annotation[]
  onOpen: (annotation: Annotation) => void
  onRemove: (id: string) => void
  onExport: () => void
  onClose: () => void
}

export function AnnotationsPanel({
  annotations,
  onOpen,
  onRemove,
  onExport,
  onClose,
}: AnnotationsPanelProps) {
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
      <div className="drawer drawer--right" role="dialog" aria-label="劃線與筆記">
        <div className="drawer__header">
          <h2>劃線與筆記</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <CloseIcon />
          </button>
        </div>

        {annotations.length === 0 ? (
          <p className="drawer__empty">還沒有劃線。選取內文即可標記。</p>
        ) : (
          <>
            <div className="annotations">
              {annotations.map((annotation) => (
                <div key={annotation.id} className="annotation">
                  <button className="annotation__body" onClick={() => onOpen(annotation)}>
                    <span className="annotation__chapter">{annotation.chapterTitle}</span>
                    <span className="annotation__text" data-color={annotation.color}>
                      {annotation.text}
                    </span>
                    {annotation.note && <span className="annotation__note">{annotation.note}</span>}
                  </button>
                  <button
                    className="annotation__remove"
                    onClick={() => onRemove(annotation.id)}
                    aria-label="刪除這則標註"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="drawer__footer">
              <button className="file-button" onClick={onExport}>
                匯出 Markdown
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
