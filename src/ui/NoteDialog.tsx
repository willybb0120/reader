import { useEffect, useRef, useState } from 'react'

interface NoteDialogProps {
  quote: string
  note: string
  onSave: (note: string) => void
  onClose: () => void
}

export function NoteDialog({ quote, note, onSave, onClose }: NoteDialogProps) {
  const [draft, setDraft] = useState(note)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave(draft.trim())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [draft, onClose, onSave])

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="note-dialog" role="dialog" aria-label="編輯筆記">
        <blockquote className="note-dialog__quote">{quote}</blockquote>
        <textarea
          ref={textareaRef}
          value={draft}
          placeholder="寫下你的想法…"
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
        />
        <div className="note-dialog__actions">
          <span className="note-dialog__hint">⌘ / Ctrl + Enter 儲存</span>
          <button onClick={onClose}>取消</button>
          <button className="file-button" onClick={() => onSave(draft.trim())}>
            儲存
          </button>
        </div>
      </div>
    </>
  )
}
