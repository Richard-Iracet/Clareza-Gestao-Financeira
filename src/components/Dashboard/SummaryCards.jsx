import { useMemo } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { formatCurrency } from '../../utils/currency'
import { getFutureCommittedExpenses, getMonthlyFinancialSummary, getNextThirtyDaysSummary, getOpenInvoiceTotal, getRealizedExpenses, getRealizedIncome } from '../../utils/financialSelectors'
import Balance from './Balance'

export default function SummaryCards() {
  const { transactions, invoices, filters } = useFinance(); const now = new Date(); const month = Number(filters.invoiceMonth || now.getMonth() + 1); const year = Number(filters.invoiceYear || now.getFullYear())
  const summary = useMemo(() => { const monthly = getMonthlyFinancialSummary(transactions, invoices, month, year, now); const income = getRealizedIncome(transactions); const expenses = getRealizedExpenses(transactions); return { monthly, income, expenses, balance: income - expenses, next30: getNextThirtyDaysSummary(transactions, invoices, now).expenses, future: getFutureCommittedExpenses(transactions, now), openInvoices: getOpenInvoiceTotal(invoices) } }, [transactions, invoices, month, year])
  const cards = [['Receitas realizadas', summary.income, 'income', '↓', 'Acumulado recebido'], ['Despesas realizadas', summary.expenses, 'expense', '↑', 'Acumulado pago'], ['Pendente no mês', summary.monthly.expensesForecast, 'pending', '◷', `${String(month).padStart(2, '0')}/${year}`], ['Vencido', summary.monthly.overdueExpenses, 'expense', '!', 'Na competência selecionada'], ['Próximos 30 dias', summary.next30, 'pending', '→', 'Obrigações conhecidas'], ['Comprometido futuro', summary.future, 'neutral', '◇', 'Após a competência atual'], ['Faturas abertas', summary.openInvoices, 'neutral', '▣', 'Somente saldo pendente']]
  return <section className="summary-grid" aria-label="Resumo financeiro"><Balance value={summary.balance} />{cards.map(([label, value, kind, icon, period]) => <article className="summary-card" key={label} title={period}><span className={`summary-icon ${kind}`}>{icon}</span><div><p>{label}</p><strong>{formatCurrency(value)}</strong><small>{period}</small></div></article>)}</section>
}
