import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFinance } from '../../context/FinanceContext'
import { getAccountRealizedBalance } from '../../domain/accounts/accountSelectors'
import { formatFinancialCycle, getAvailableUntilNextIncome, getFinancialCycleSummary, getOpenInvoicesSummary, getUnassignedDashboardInfo, getUpcomingFinancialEvents } from '../../domain/dashboard/dashboardSelectors'
import FinancialCycleSettings from './FinancialCycleSettings'
import FinancialMetricCard from './FinancialMetricCard'
import MetricDetailsModal from './MetricDetailsModal'
import UpcomingCommitments from './UpcomingCommitments'

export default function SummaryCards() {
  const finance = useFinance(); const navigate = useNavigate(); const now = new Date(); const [detail, setDetail] = useState(null)
  const cycleDay = Number(finance.userSettings?.paymentCycleDay || 25)
  const data = useMemo(() => {
    const cycle = getFinancialCycleSummary({ transactions: finance.transactions, referenceDate: now, cycleDay })
    const invoices = getOpenInvoicesSummary(finance.invoices, finance.cards)
    const untilIncome = getAvailableUntilNextIncome({ ...finance, referenceDate: now, cycleDay })
    const days = Math.max(0, Math.ceil((new Date(`${cycle.cycle.nextExpectedDate}T12:00:00`) - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 86400000))
    const upcoming = getUpcomingFinancialEvents({ ...finance, referenceDate: now, days })
    const accounts = finance.accounts.filter((account) => !account.archived && account.includeInTotalBalance).map((account) => ({ ...account, balance: getAccountRealizedBalance(account, finance.transactions, finance.invoicePayments, now, finance.transfers) }))
    return { cycle, invoices, untilIncome, upcoming, accounts, unassigned: getUnassignedDashboardInfo(finance.transactions) }
  }, [finance.transactions, finance.invoices, finance.cards, finance.accounts, finance.invoicePayments, finance.transfers, cycleDay])
  const go = (action) => { if (action.filters) finance.setFilters((current) => ({ ...current, ...action.filters })); setDetail(null); navigate(action.path) }
  const rangeFilters = { dateFrom: data.cycle.cycle.start, dateTo: data.cycle.cycle.end, competenceMonth: '', competenceYear: '', transferScope: 'exclude' }
  const resultMessage = data.cycle.result > 0 ? 'Você gastou menos do que recebeu neste ciclo' : data.cycle.result < 0 ? 'Você gastou mais do que recebeu neste ciclo' : 'Suas entradas e despesas estão equilibradas'
  return <>
    <FinancialCycleSettings day={cycleDay} cycle={data.cycle.cycle} onSave={(day) => finance.setUserSettings((current) => ({ ...current, paymentCycleDay: day }))} />
    <section aria-labelledby="situation-title"><div className="dashboard-section-title"><p className="eyebrow">Visão geral</p><h1 id="situation-title">Situação financeira</h1><p>Saldo atual, ciclo pessoal e compromissos até o próximo recebimento.</p></div>
      {data.unassigned.count > 0 && <div className="dashboard-data-warning" role="status"><strong>{data.unassigned.count} lançamento(s) sem conta</strong><span>Esses valores estão fora do saldo consolidado.</span><button type="button" className="text-button" onClick={() => go({ path: '/lancamentos', filters: { accountId: '__unassigned__' } })}>Revisar</button></div>}
      <div className="financial-metric-grid situation-grid">
        <FinancialMetricCard featured title="Saldo disponível" value={data.untilIncome.available} description="Valor atual nas suas contas" meta={`${data.accounts.length} conta(s) no consolidado`} onOpen={() => setDetail({ type: 'accounts', title: 'Saldo disponível', total: data.untilIncome.available, description: 'Composição do saldo consolidado por conta.', period: 'Até hoje', accounts: data.accounts, action: { path: '/configuracoes', label: 'Abrir contas' } })} />
        <FinancialMetricCard title="Total em faturas" value={data.invoices.total} description="Saldo pendente nos cartões" meta={`${data.invoices.items.length} fatura(s) · ${data.invoices.cardCount} cartão(ões)`} onOpen={() => setDetail({ type: 'invoices', title: 'Total em faturas', total: data.invoices.total, description: 'Faturas abertas, fechadas ou vencidas com saldo pendente.', period: data.invoices.nextDueDate ? `Próximo vencimento ${data.invoices.nextDueDate}` : 'Sem vencimento pendente', invoices: data.invoices.items, action: { path: '/faturas', label: 'Abrir faturas' } })} />
        <FinancialMetricCard kind={data.untilIncome.total < 0 ? 'expense' : 'income'} title="Disponível até o próximo pagamento" value={data.untilIncome.total} description={data.untilIncome.total < 0 ? 'Valor que falta para cobrir os compromissos' : 'Após os compromissos previstos'} meta={`Estimativa até ${data.cycle.cycle.nextExpectedDate.slice(8, 10)}/${data.cycle.cycle.nextExpectedDate.slice(5, 7)}`} onOpen={() => setDetail({ type: 'calculation', title: 'Disponível até o próximo pagamento', total: data.untilIncome.total, description: 'Estimativa de caixa antes do próximo ciclo; o recebimento principal esperado não é incluído automaticamente.', period: `Até ${data.cycle.cycle.nextExpectedDate}`, breakdown: [{ label: 'Saldo disponível', value: data.untilIncome.available }, { label: 'Outras entradas previstas', value: data.untilIncome.income, sign: '+' }, { label: 'Despesas pendentes', value: data.untilIncome.expenses, sign: '−' }, { label: 'Faturas até o recebimento', value: data.untilIncome.invoiceTotal, sign: '−' }, { label: 'Transferências agendadas', value: data.untilIncome.transferTotal, sign: '−' }] })} />
      </div>
    </section>
    <section aria-labelledby="cycle-title"><div className="dashboard-section-title"><p className="eyebrow">Ciclo pessoal</p><h2 id="cycle-title">Movimento desde o recebimento</h2><p>{formatFinancialCycle(data.cycle.cycle)}</p></div><div className="financial-metric-grid cycle-grid">
      <FinancialMetricCard title="Receitas do ciclo" value={data.cycle.incomeTotal} description="Entradas recebidas desde o início do seu ciclo" kind="income" meta={`${data.cycle.incomes.length} entrada(s) · ${formatFinancialCycle(data.cycle.cycle)}`} onOpen={() => setDetail({ type: 'income', title: 'Receitas do ciclo', total: data.cycle.incomeTotal, description: 'Somente entradas efetivamente recebidas no ciclo.', period: formatFinancialCycle(data.cycle.cycle), groups: data.cycle.incomeBySource, items: data.cycle.incomes, previous: data.cycle.previousIncomeTotal, action: { path: '/lancamentos', label: 'Ver receitas deste ciclo', filters: { ...rangeFilters, type: 'income', status: 'received' } } })} />
      <FinancialMetricCard title="Despesas do ciclo" value={data.cycle.expenseTotal} description="Consumo realizado desde o início do ciclo" kind="expense" meta={`${data.cycle.expenses.length} despesa(s)`} onOpen={() => setDetail({ type: 'expenses', title: 'Despesas do ciclo', total: data.cycle.expenseTotal, description: 'Compras e despesas de consumo; pagamento de fatura não é contado novamente.', period: `${data.cycle.cycle.start} até hoje`, groups: data.cycle.expenseByOrigin, categories: data.cycle.expenseByCategory.slice(0, 5), items: data.cycle.largestExpenses, count: data.cycle.expenses.length, action: { path: '/lancamentos', label: 'Ver despesas deste ciclo', filters: { ...rangeFilters, type: 'expense', status: 'paid' } } })} />
      <FinancialMetricCard title="Resultado do ciclo" value={data.cycle.result} description={resultMessage} kind={data.cycle.result < 0 ? 'expense' : 'income'} meta={formatFinancialCycle(data.cycle.cycle)} onOpen={() => setDetail({ type: 'result', title: 'Resultado do ciclo', total: data.cycle.result, description: resultMessage, period: formatFinancialCycle(data.cycle.cycle), breakdown: [{ label: 'Receitas do ciclo', value: data.cycle.incomeTotal, sign: '+' }, { label: 'Despesas do ciclo', value: data.cycle.expenseTotal, sign: '−' }], categories: data.cycle.expenseByCategory.slice(0, 3), previous: data.cycle.previousIncomeTotal - data.cycle.previousExpenseTotal })} />
    </div></section>
    <UpcomingCommitments events={data.upcoming} nextIncomeDate={data.cycle.cycle.nextExpectedDate} onOpen={() => setDetail({ type: 'events', title: 'Próximos compromissos', total: data.upcoming.reduce((sum, item) => sum + (item.direction === 'in' ? item.amount : -item.amount), 0), description: 'Eventos entre hoje e o próximo recebimento esperado.', period: `Até ${data.cycle.cycle.nextExpectedDate}`, items: data.upcoming })} />
    {detail && <MetricDetailsModal detail={detail} onClose={() => setDetail(null)} onNavigate={go} />}
  </>
}
