import { useState } from 'react'
import { runFinanceDiagnostics } from '../../utils/financeDiagnostics'
import { getBrowserStorage } from '../../utils/storage'
import { useFinance } from '../../context/FinanceContext'

const severityLabels = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' }

export default function DataDiagnostics() {
  const { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments } = useFinance()
  const [report, setReport] = useState(null)
  const run = () => setReport(runFinanceDiagnostics(getBrowserStorage(), { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments }))
  return (
    <article className="settings-card diagnostics-card">
      <div className="settings-icon">✓</div><h3>Diagnóstico dos dados</h3>
      <p>Analisa integridade de contas, faturas e parcelas. Nenhum dado será modificado.</p>
      <button className="outline-button" onClick={run}>Executar diagnóstico</button>
      {report && <div className="diagnostics-report" aria-live="polite"><div className={`diagnostics-summary ${report.healthy ? 'healthy' : 'warning'}`}><strong>{report.healthy ? 'Nenhum problema encontrado' : `${report.summary.problems} ocorrência(s) encontrada(s)`}</strong><span>{report.summary.transactions} lançamentos · {report.summary.cards} cartões · {report.summary.accounts} contas · {report.summary.transfers} transferências · {report.summary.recurrences} recorrências · {report.summary.alertStates} estados de alerta · {report.summary.invoiceRecords} registros de fatura</span></div>{report.issues.map((item) => <section className="diagnostic-issue" key={item.id}><div><span className={`severity-badge ${item.severity}`}>{severityLabels[item.severity]}</span><strong>{item.description}</strong><b>{item.count}</b></div><p>{item.suggestion}</p>{item.examples.length > 0 && <details><summary>Ver exemplos</summary><ul>{item.examples.map((example) => <li key={String(example)}>{String(example)}</li>)}</ul></details>}</section>)}</div>}
    </article>
  )
}
