import { SHORTCUT_HELP } from '../reader/shortcuts'

interface HelpDialogProps {
  onClose: () => void
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="note-dialog help" role="dialog" aria-label="鍵盤快捷鍵">
        <h2>鍵盤快捷鍵</h2>
        <dl className="help__list">
          {SHORTCUT_HELP.map(({ keys, description }) => (
            <div key={keys} className="help__row">
              <dt>
                {keys.split(' ').map((part, index) =>
                  part === '或' || part === '/' ? (
                    <span key={index} className="help__sep">
                      {part}
                    </span>
                  ) : (
                    <kbd key={index}>{part}</kbd>
                  ),
                )}
              </dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
        <div className="note-dialog__actions">
          <span className="note-dialog__hint" />
          <button className="file-button" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </>
  )
}
