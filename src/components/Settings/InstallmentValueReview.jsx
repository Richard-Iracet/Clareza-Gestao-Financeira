import { useMemo, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { analyzeInstallmentValues } from '../../utils/installmentValueCalculations'
export default function InstallmentValueReview() {
  const { transactions, installmentValueMigration, runInstallmentValueMigration } = useFinance(); const report = useMemo(() => analyzeInstallmentValues(transactions), [transactions]); const [result, setResult] = useState(null)
  return <article className="settings-card"><div className="settings-icon">$</div><h3>Valores das parcelas</h3><p>Normaliza somente `installmentAmount` ausente quando `amount` é válido.</p><p>{report.safe.length} caso(s) seguro(s) · {report.ambiguous.length} ambíguo(s)</p><button className="outline-button" disabled={installmentValueMigration >= 1 || report.safe.length === 0} onClick={() => setResult(runInstallmentValueMigration())}>{installmentValueMigration >= 1 ? 'Migração já executada' : 'Normalizar casos seguros'}</button>{result && <p className="settings-feedback success">{result.changed.length} registro(s) normalizado(s); contagem preservada.</p>}</article>
}
