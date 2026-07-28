import { useEffect, useRef, useState } from 'react'
import { formatDate } from '../../utils/currency'

export default function EditableInvoiceDate({ label, value, isCustom, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  const save = () => { if (!draft) { setError('Informe uma data válida.'); return } setError(''); onSave(draft); setEditing(false) }
  const keyDown = (event) => {
    if (event.key === 'Escape') { setDraft(value); setEditing(false) }
    if (event.key === 'Enter') save()
  }
  if (editing) return <span className="editable-date editing"><span>{label}</span><input ref={inputRef} type="date" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={keyDown} aria-invalid={Boolean(error)} />{error && <small className="form-error">{error}</small>}{isCustom && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSave(null); setEditing(false) }}>Usar data padrão</button>}</span>
  return <button type="button" className="editable-date" onClick={() => setEditing(true)} title={`Editar ${label.toLowerCase()}`}><span>{label}</span><strong>{formatDate(value)} <i>✎</i></strong></button>
}
