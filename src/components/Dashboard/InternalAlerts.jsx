import { useMemo, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { formatCurrency, formatDate } from '../../utils/currency'

const severityLabel = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Informativo',
}
const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const addDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const safeFormatDate = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? formatDate(String(value).slice(0, 10)) : ''
const alertDescription = (alert) => alert.description || alert.message || alert.detail || 'Reveja este ponto antes de confirmar seus próximos lançamentos.'
const alertTitle = (alert) => alert.title || alert.label || alert.type || 'Alerta financeiro'

export default function InternalAlerts() {
  const { alerts = [], dismissAlert, snoozeAlert, markAlertRead } = useFinance()
  const [feedback, setFeedback] = useState('')
  const [expanded, setExpanded] = useState(null)
  const orderedAlerts = useMemo(() => [...alerts].sort((left, right) => (severityOrder[left.severity] ?? 5) - (severityOrder[right.severity] ?? 5) || String(left.referenceDate || left.dueDate || '').localeCompare(String(right.referenceDate || right.dueDate || ''))), [alerts])
  const act = (callback, successText) => {
    const result = callback?.()
    if (result?.success === false) {
      setFeedback(result.errors?.join(' ') || result.message || 'Não foi possível atualizar o estado deste alerta.')
      return
    }
    setFeedback(successText)
  }
  const alertDate = (alert) => alert.referenceDate || alert.dueDate || alert.date || alert.scheduledOccurrenceDate

  return <section className="internal-alerts panel" aria-labelledby="internal-alerts-title">
    <div className="internal-alerts-heading"><div><p className="eyebrow">Acompanhamento</p><h2 id="internal-alerts-title">Alertas internos</h2><p className="muted">Avisos locais baseados nos seus dados. Eles não confirmam pagamentos nem alteram lançamentos.</p></div><span className={`alert-count ${orderedAlerts.some((alert) => alert.severity === 'critical') ? 'critical' : ''}`}>{orderedAlerts.length} {orderedAlerts.length === 1 ? 'alerta' : 'alertas'}</span></div>
    {feedback && <p className="alert-feedback" role="status">{feedback}</p>}
    {!orderedAlerts.length ? <div className="alerts-empty"><span aria-hidden="true">✓</span><div><strong>Nenhum alerta ativo no momento.</strong><p>Novos alertas aparecerão aqui conforme vencimentos, recorrências e projeções exigirem atenção.</p></div></div> : <ul className="internal-alert-list">{orderedAlerts.map((alert) => {
      const key = alert.alertKey || alert.id
      const isExpanded = expanded === key
      const date = alertDate(alert)
      const amount = Number(alert.amount ?? alert.value)
      const outflows = Array.isArray(alert.metadata?.principalOutflows) ? alert.metadata.principalOutflows : []
      return <li className={`internal-alert ${alert.severity || 'info'} ${alert.read ? 'read' : 'unread'}`} key={key}>
        <span className="alert-severity" aria-label={`Gravidade ${severityLabel[alert.severity] || 'informativa'}`}>{(severityLabel[alert.severity] || 'I').slice(0, 1)}</span>
        <div className="alert-copy"><div className="alert-title-row"><strong>{alertTitle(alert)}</strong><span className={`alert-severity-badge ${alert.severity || 'info'}`}>{severityLabel[alert.severity] || 'Informativo'}</span>{!alert.read && <span className="alert-new">Novo</span>}</div><p>{alertDescription(alert)}</p>{isExpanded && <><dl className="alert-details">{date && <div><dt>Data relacionada</dt><dd>{safeFormatDate(date)}</dd></div>}{Number.isFinite(amount) && <div><dt>Valor</dt><dd>{formatCurrency(amount)}</dd></div>}{alert.accountName && <div><dt>Conta</dt><dd>{alert.accountName}</dd></div>}{alert.recurrenceDescription && <div><dt>Recorrência</dt><dd>{alert.recurrenceDescription}</dd></div>}{Number.isFinite(Number(alert.metadata?.amountNeeded)) && <div><dt>Valor necessário para cobrir</dt><dd>{formatCurrency(Number(alert.metadata.amountNeeded))}</dd></div>}</dl>{outflows.length > 0 && <div className="alert-outflows"><strong>Principais saídas previstas</strong><ul>{outflows.map((outflow, index) => <li key={`${outflow.date}-${outflow.description}-${index}`}>{safeFormatDate(outflow.date)} · {outflow.description} · {formatCurrency(Number(outflow.amount || 0))}</li>)}</ul></div>}</>}</div>
        <div className="alert-actions"><button type="button" className="text-button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : key)}>{isExpanded ? 'Menos' : 'Detalhes'}</button>{!alert.read && <button type="button" className="text-button" onClick={() => act(() => markAlertRead?.(key), 'Alerta marcado como lido.')}>Marcar como lido</button>}<details className="alert-snooze"><summary>Adiar</summary><div><button type="button" onClick={() => act(() => snoozeAlert?.(key, today()), 'Alerta adiado para hoje.')}>Hoje</button><button type="button" onClick={() => act(() => snoozeAlert?.(key, addDays(1)), 'Alerta adiado para amanhã.')}>1 dia</button><button type="button" onClick={() => act(() => snoozeAlert?.(key, addDays(7)), 'Alerta adiado por 7 dias.')}>7 dias</button></div></details><button type="button" className="text-button alert-dismiss" onClick={() => act(() => dismissAlert?.(key), 'Alerta dispensado.')}>Dispensar</button></div>
      </li>
    })}</ul>}
  </section>
}
