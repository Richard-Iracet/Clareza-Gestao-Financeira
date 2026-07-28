import { useMemo, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { analyzeInvoiceDateRecords } from '../../utils/invoiceDates'
export default function InvoiceDateMigrationReview() {
  const { transactions, invoicePayments, invoiceDateMigration, runInvoiceDateMigration } = useFinance(); const report = useMemo(() => analyzeInvoiceDateRecords(transactions, invoicePayments), [transactions, invoicePayments]); const [result, setResult] = useState(null)
  return <article className="settings-card"><div className="settings-icon">▦</div><h3>Datas oficiais das faturas</h3><p>{report.safe.length} fatura(s) histórica(s) segura(s) · {report.ambiguous.length} divergente(s).</p><button className="outline-button" disabled={invoiceDateMigration >= 1 || report.safe.length === 0} onClick={() => setResult(runInvoiceDateMigration())}>{invoiceDateMigration >= 1 ? 'Migração já executada' : 'Consolidar datas seguras'}</button>{result && <p className="settings-feedback success">{result.created.length} registro(s) oficial(is) criado(s).</p>}</article>
}
