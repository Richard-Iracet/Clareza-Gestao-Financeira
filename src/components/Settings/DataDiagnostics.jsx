import { useState } from 'react'
import { isFeatureEnabled } from '../../config/featureFlags'
import { readAppEnvironment } from '../../config/appEnvironment'
import { useFinance } from '../../context/FinanceContext'
import { createBaselineReport } from '../../domain/baseline/baselineReport'
import { createPhase0EvidencePackage } from '../../domain/baseline/baselineEvidence'
import { createBackup } from '../../utils/backup'
import { runFinanceDiagnostics } from '../../utils/financeDiagnostics'
import { getBrowserStorage } from '../../utils/storage'

const severityLabels = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' }

export default function DataDiagnostics() {
  const finance = useFinance()
  const { financeState, transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments } = finance
  const [report, setReport] = useState(null)
  const run = () => setReport(runFinanceDiagnostics(getBrowserStorage(), { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments }))
  const baselineTools = isFeatureEnabled('phase0BaselineTools')
  const download = (value, name) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url)
  }
  const exportBaseline = (withEvidence) => {
    const backup = createBackup(getBrowserStorage(), financeState)
    const baseline = createBaselineReport(financeState, { snapshot: backup.snapshot })
    const date = baseline.metadata.generatedAt.slice(0, 10)
    const output = withEvidence ? createPhase0EvidencePackage({ backup, baselineReport: baseline, environment: readAppEnvironment().value }) : baseline
    download(output, withEvidence ? `clareza-fase0-evidencias-${date}.json` : `clareza-linha-base-${date}.json`)
  }
  return (
    <article className="settings-card diagnostics-card">
      <div className="settings-icon">✓</div><h3>Diagnóstico dos dados</h3>
      <p>Analisa integridade de contas, faturas e parcelas. Nenhum dado será modificado.</p>
      <button className="outline-button" onClick={run}>Executar diagnóstico</button>
      {baselineTools && <div className="settings-actions"><button className="outline-button" onClick={() => exportBaseline(false)}>Exportar linha de base</button><button className="outline-button" onClick={() => exportBaseline(true)}>Exportar evidências Fase 0</button></div>}
      {report && <div className="diagnostics-report" aria-live="polite"><div className={`diagnostics-summary ${report.healthy ? 'healthy' : 'warning'}`}><strong>{report.healthy ? 'Nenhum problema encontrado' : `${report.summary.problems} ocorrência(s) encontrada(s)`}</strong><span>{report.summary.transactions} lançamentos · {report.summary.cards} cartões · {report.summary.accounts} contas · {report.summary.transfers} transferências · {report.summary.recurrences} recorrências · {report.summary.alertStates} estados de alerta · {report.summary.invoiceRecords} registros de fatura</span></div>{report.issues.map((item) => <section className="diagnostic-issue" key={item.id}><div><span className={`severity-badge ${item.severity}`}>{severityLabels[item.severity]}</span><strong>{item.description}</strong><b>{item.count}</b></div><p>{item.suggestion}</p>{item.examples.length > 0 && <details><summary>Ver exemplos</summary><ul>{item.examples.map((example) => <li key={String(example)}>{String(example)}</li>)}</ul></details>}</section>)}</div>}
    </article>
  )
}
