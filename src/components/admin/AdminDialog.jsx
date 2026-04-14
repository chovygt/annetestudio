import { useEffect } from 'react'

export default function AdminDialog({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="admin-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="admin-dialog-header">
          <h3 id="admin-dialog-title">{title}</h3>
          <button type="button" className="admin-dialog-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="admin-dialog-body">{children}</div>
      </div>
    </div>
  )
}
