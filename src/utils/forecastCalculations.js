import { getMonthlyFinancialSummary, getTransactionCompetence, isTransactionRealized } from './financialSelectors.js'
import { getTransactionAmount } from './installmentValueCalculations.js'
export const buildMonthlyForecast = (transactions, invoices = [], months = 6, referenceDate = new Date()) => {
  if (![3, 6, 12].includes(Number(months))) throw new Error('Período de previsão inválido.')
  const startKey = referenceDate.getFullYear() * 100 + referenceDate.getMonth() + 1
  const realizedBefore = transactions.filter((item) => { const competence = getTransactionCompetence(item); return competence && competence.year * 100 + competence.month < startKey && isTransactionRealized(item) }).reduce((balance, item) => balance + (item.type === 'income' ? 1 : -1) * getTransactionAmount(item), 0)
  let accumulated = realizedBefore
  return Array.from({ length: Number(months) }, (_, index) => {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + index, 1); const month = date.getMonth() + 1; const year = date.getFullYear(); const summary = getMonthlyFinancialSummary(transactions, invoices, month, year, referenceDate)
    const invoiceItems = invoices.filter((invoice) => invoice.invoiceMonth === month && invoice.invoiceYear === year); const invoiceTotal = invoiceItems.reduce((total, invoice) => total + Number(invoice.totalPending || 0), 0); const futureInstallments = summary.transactions.filter((item) => item.type === 'expense' && Number(item.installmentTotal) > 1 && !isTransactionRealized(item)).length
    const monthlyBalance = summary.incomeRealized + summary.incomeForecast - summary.expensesRealized - summary.expensesForecast; accumulated += monthlyBalance
    return { ...summary, label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date), invoiceTotal, openInvoices: invoiceItems.filter((invoice) => invoice.status !== 'paid').length, futureInstallments, monthlyBalance, accumulatedBalance: accumulated }
  })
}
