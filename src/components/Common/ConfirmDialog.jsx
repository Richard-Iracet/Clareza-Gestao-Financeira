import { useEffect, useRef, useState } from 'react'

export default function ConfirmDialog({ open, title, description, impact, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, critical = false, loading = false, error = '', onConfirm, onCancel, children }) {
  const dialogRef = useRef(null); const confirmRef = useRef(null); const previousFocus = useRef(null); const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    previousFocus.current = document.activeElement; confirmRef.current?.focus()
    const keydown = (event) => {
      if (event.key === 'Escape' && !loading && !submitting) onCancel?.()
      if (event.key !== 'Tab') return
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previousFocus.current?.focus?.() }
  }, [open, critical, loading, submitting, onCancel])
  if (!open) return null
  const confirm = async () => { if (submitting || loading) return; setSubmitting(true); try { await onConfirm?.() } finally { setSubmitting(false) } }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !critical && !loading && !submitting) onCancel?.() }}><section ref={dialogRef} className={`modal confirm-dialog ${danger ? 'danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
    <h2 id="confirm-title">{title}</h2>{description && <p id="confirm-description">{description}</p>}{impact && <div className="dialog-impact">{impact}</div>}{children}{error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="text-button" disabled={loading || submitting} onClick={onCancel}>{cancelLabel}</button><button ref={confirmRef} type="button" className={danger ? 'danger-button' : 'primary-button'} disabled={loading || submitting} onClick={confirm}>{loading || submitting ? 'Salvando...' : confirmLabel}</button></div>
  </section></div>
}
