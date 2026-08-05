import { useState } from 'react'

export default function FinancialCycleSettings({ day, cycle, onSave }) {
  const [editing, setEditing] = useState(false); const [value, setValue] = useState(String(day))
  const save = () => { const next = Math.min(31, Math.max(1, Number(value) || 25)); onSave(next); setValue(String(next)); setEditing(false) }
  return <aside className="cycle-context" aria-label="Configuração do ciclo financeiro"><div><span>Ciclo financeiro atual</span><strong>{cycle.start.slice(8, 10)}/{cycle.start.slice(5, 7)} até {cycle.end.slice(8, 10)}/{cycle.end.slice(5, 7)}</strong></div><div><span>Próximo recebimento esperado</span><strong>{cycle.nextExpectedDate.slice(8, 10)}/{cycle.nextExpectedDate.slice(5, 7)}</strong><small>Data estimada; não é receita confirmada</small></div>{editing ? <div className="cycle-edit"><label>Dia habitual<input type="number" min="1" max="31" value={value} onChange={(event) => setValue(event.target.value)} /></label><button type="button" className="primary-button" onClick={save}>Salvar</button><button type="button" className="text-button" onClick={() => setEditing(false)}>Cancelar</button></div> : <button type="button" className="text-button" onClick={() => setEditing(true)}>Configurar dia do ciclo</button>}</aside>
}
