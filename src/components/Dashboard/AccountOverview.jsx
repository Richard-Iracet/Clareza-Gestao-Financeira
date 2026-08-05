import { useMemo } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { getAccountMovements, getAccountProjectedBalance, getAccountRealizedBalance, getConsolidatedBalance, getConsolidatedProjectedBalance } from '../../domain/accounts/accountSelectors'
import { getUnassignedDashboardInfo } from '../../domain/dashboard/dashboardSelectors'
import { formatCurrency } from '../../utils/currency'

export default function AccountOverview() {
  const { accounts, transactions, transfers, invoicePayments } = useFinance()
  const now = new Date()
  const summary = useMemo(() => ({
    active: accounts.filter((account) => !account.archived),
    realized: getConsolidatedBalance(accounts, transactions, invoicePayments, now, transfers),
    projected: getConsolidatedProjectedBalance(accounts, transactions, invoicePayments, now, transfers),
    unassigned: getUnassignedDashboardInfo(transactions),
  }), [accounts, transactions, transfers, invoicePayments])
  return <section className="account-overview" aria-labelledby="accounts-overview-title">
    <div className="section-heading"><div><p className="eyebrow">Contas financeiras</p><h2 id="accounts-overview-title">Saldos por conta</h2><p className="muted">Compras no cartão só reduzem uma conta quando a fatura é paga.</p></div></div>
    {summary.active.length === 0 ? <div className="empty-state account-empty"><h3>Nenhuma conta financeira cadastrada</h3><p>Cadastre contas em Configurações para acompanhar saldos.</p></div> : <>
      <div className="account-summary-grid"><article><span>Saldo disponível consolidado</span><strong>{formatCurrency(summary.realized)}</strong><small>{summary.active.filter((account) => account.includeInTotalBalance).length} conta(s) incluída(s)</small></article><article><span>Saldo após compromissos</span><strong>{formatCurrency(summary.projected)}</strong><small>Lançamentos diretos pendentes e transferências agendadas</small></article>{summary.unassigned.count > 0 && <article className="unassigned-warning"><span>Organização pendente</span><strong>{formatCurrency(summary.unassigned.total)}</strong><small>{summary.unassigned.count} lançamento(s) sem conta · fora do consolidado</small></article>}</div>
      <div className="account-overview-grid">{summary.active.map((account) => {
        const realized = getAccountRealizedBalance(account, transactions, invoicePayments, now, transfers)
        const projected = getAccountProjectedBalance(account, transactions, invoicePayments, now, transfers)
        const planned = getAccountMovements(transactions, invoicePayments, account.accountId, { realized: false, transfers, referenceDate: now })
        const inflows = planned.filter((item) => item.type === 'income' || item.direction === 'in').reduce((total, item) => total + Number(item.amount || 0), 0)
        const outflows = planned.filter((item) => item.type === 'expense' || item.direction === 'out').reduce((total, item) => total + Number(item.amount || 0), 0)
        return <details className={`account-detail-card ${projected < 0 ? 'at-risk' : ''}`} key={account.accountId}><summary><div><h3>{account.name}</h3><span>{account.institution || 'Sem instituição'}</span></div><span aria-hidden="true">⌄</span></summary><dl><div><dt>Saldo atual</dt><dd>{formatCurrency(realized)}</dd></div><div><dt>Após compromissos</dt><dd>{formatCurrency(projected)}</dd></div><div><dt>Próximas entradas</dt><dd>{formatCurrency(inflows)}</dd></div><div><dt>Próximas saídas</dt><dd>{formatCurrency(outflows)}</dd></div></dl>{projected < 0 && <strong className="risk-label">Atenção: projeção negativa</strong>}{!account.includeInTotalBalance && <small>Fora do consolidado</small>}<div className="account-movement-preview">{planned.length ? planned.slice(0, 5).map((item) => <span key={item.id || item.transferId}>{item.description || 'Movimentação'} · {formatCurrency(Number(item.amount || 0))}</span>) : <span>Sem compromissos previstos para esta conta.</span>}</div></details>
      })}</div>
    </>}
  </section>
}
