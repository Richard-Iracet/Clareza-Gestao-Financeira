import { useMemo } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { getAccountProjectedBalance, getAccountRealizedBalance, getConsolidatedBalance, getConsolidatedProjectedBalance, getUnassignedTransactionsTotal } from '../../domain/accounts/accountSelectors'
import { formatCurrency } from '../../utils/currency'

export default function AccountOverview() {
  const { accounts, transactions, transfers, invoicePayments } = useFinance()
  const summary = useMemo(() => {
    const active = accounts.filter((account) => !account.archived)
    return {
      active,
      archived: accounts.filter((account) => account.archived).length,
      excluded: active.filter((account) => !account.includeInTotalBalance).length,
      realized: getConsolidatedBalance(accounts, transactions, invoicePayments, new Date(), transfers),
      projected: getConsolidatedProjectedBalance(accounts, transactions, invoicePayments, new Date(), transfers),
      unassigned: getUnassignedTransactionsTotal(transactions, invoicePayments),
    }
  }, [accounts, transactions, transfers, invoicePayments])

  return (
    <section className="account-overview" aria-labelledby="accounts-overview-title">
      <div className="section-heading"><div><p className="eyebrow">Contas financeiras</p><h2 id="accounts-overview-title">Saldos por conta</h2><p className="muted">Compras no cartão entram no consumo global; somente o pagamento da fatura reduz a conta pagadora.</p></div></div>
      {summary.active.length === 0 ? <div className="empty-state account-empty"><span aria-hidden="true">◎</span><h3>Nenhuma conta financeira cadastrada</h3><p>Cadastre contas em Configurações para acompanhar saldos sem alterar seus lançamentos antigos.</p></div> : <>
        <div className="account-summary-grid">
          <article><span>Saldo consolidado realizado</span><strong>{formatCurrency(summary.realized)}</strong><small>{summary.active.filter((account) => account.includeInTotalBalance).length} conta(s) incluída(s)</small></article>
          <article><span>Saldo consolidado projetado</span><strong>{formatCurrency(summary.projected)}</strong><small>Considera lançamentos diretos pendentes e transferências agendadas</small></article>
          <article><span>Sem conta definida</span><strong>{formatCurrency(summary.unassigned)}</strong><small>{summary.excluded} fora do consolidado · {summary.archived} arquivada(s)</small></article>
        </div>
        <div className="account-overview-grid">{summary.active.map((account) => <article key={account.accountId}><div><h3>{account.name}</h3><span>{account.institution || 'Sem instituição'}</span></div><dl><div><dt>Realizado</dt><dd>{formatCurrency(getAccountRealizedBalance(account, transactions, invoicePayments, new Date(), transfers))}</dd></div><div><dt>Projetado</dt><dd>{formatCurrency(getAccountProjectedBalance(account, transactions, invoicePayments, new Date(), transfers))}</dd></div></dl>{!account.includeInTotalBalance && <small>Fora do consolidado</small>}</article>)}</div>
      </>}
    </section>
  )
}
