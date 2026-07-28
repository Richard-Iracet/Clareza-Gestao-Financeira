import { getTransactionAmount } from './installmentValueCalculations.js'
import { parseLocalDate } from './dateCalculations.js'

const localParts = (date) => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
const competenceKey = ({ year, month }) => Number(year) * 100 + Number(month)
export const getTransactionAccountingAmount = getTransactionAmount
export const getTransactionCompetence = (transaction) => {
  if (transaction.cardId && transaction.invoiceMonth && transaction.invoiceYear) return { month: Number(transaction.invoiceMonth), year: Number(transaction.invoiceYear), source: 'invoice' }
  if (transaction.competenceMonth && transaction.competenceYear) return { month: Number(transaction.competenceMonth), year: Number(transaction.competenceYear), source: 'competence' }
  const fallback = parseLocalDate(transaction.dueDate || transaction.date); return fallback ? { month: fallback.month, year: fallback.year, source: 'date-fallback' } : null
}
export const isTransactionRealized = (item) => item.status === 'paid' || item.status === 'received'
export const isTransactionPending = (item) => !isTransactionRealized(item) && ['pending', 'open', undefined, null].includes(item.status)
export const isTransactionOverdue = (item, referenceDate = new Date(), invoices = []) => { if (!isTransactionPending(item) || item.type !== 'expense') return false; const invoice = item.invoiceId ? invoices.find((value) => value.id === item.invoiceId) : null; const due = parseLocalDate(invoice?.dueDate || item.dueDate); if (!due) return false; const reference = localParts(referenceDate); return `${due.year}-${String(due.month).padStart(2, '0')}-${String(due.day).padStart(2, '0')}` < `${reference.year}-${String(reference.month).padStart(2, '0')}-${String(reference.day).padStart(2, '0')}` }
export const isTransactionFuture = (item, referenceDate = new Date()) => { const competence = getTransactionCompetence(item); return competence ? competenceKey(competence) > competenceKey(localParts(referenceDate)) : false }
const sum = (items) => items.reduce((total, item) => total + getTransactionAmount(item), 0)
export const getRealizedIncome = (items) => sum(items.filter((item) => item.type === 'income' && isTransactionRealized(item)))
export const getRealizedExpenses = (items) => sum(items.filter((item) => item.type === 'expense' && isTransactionRealized(item)))
export const getPendingExpenses = (items, referenceDate = new Date(), invoices = []) => sum(items.filter((item) => item.type === 'expense' && isTransactionPending(item) && !isTransactionOverdue(item, referenceDate, invoices)))
export const getOverdueExpenses = (items, referenceDate = new Date(), invoices = []) => sum(items.filter((item) => isTransactionOverdue(item, referenceDate, invoices)))
export const getFutureCommittedExpenses = (items, referenceDate = new Date()) => sum(items.filter((item) => item.type === 'expense' && isTransactionPending(item) && isTransactionFuture(item, referenceDate)))
export const getOpenInvoiceTotal = (invoices = []) => invoices.filter((invoice) => invoice.status !== 'paid').reduce((total, invoice) => total + Number(invoice.totalPending || 0), 0)
export const filterByCompetence = (items, month, year) => items.filter((item) => { const competence = getTransactionCompetence(item); return competence && competence.month === Number(month) && competence.year === Number(year) })
export const getMonthlyFinancialSummary = (items, invoices = [], month, year, referenceDate = new Date()) => {
  const scoped = filterByCompetence(items, month, year); const incomeRealized = getRealizedIncome(scoped); const expensesRealized = getRealizedExpenses(scoped); const incomeForecast = sum(scoped.filter((item) => item.type === 'income' && isTransactionPending(item))); const expensesForecast = sum(scoped.filter((item) => item.type === 'expense' && isTransactionPending(item)))
  return { month: Number(month), year: Number(year), transactions: scoped, incomeRealized, expensesRealized, incomeForecast, expensesForecast, pendingExpenses: getPendingExpenses(scoped, referenceDate, invoices), overdueExpenses: getOverdueExpenses(scoped, referenceDate, invoices), realizedBalance: incomeRealized - expensesRealized, projectedBalance: incomeRealized + incomeForecast - expensesRealized - expensesForecast }
}
export const getProjectedBalance = (items) => getRealizedIncome(items) - getRealizedExpenses(items) + sum(items.filter((item) => item.type === 'income' && isTransactionPending(item))) - sum(items.filter((item) => item.type === 'expense' && isTransactionPending(item)))
export const getNextThirtyDaysSummary = (items, invoices = [], referenceDate = new Date()) => { const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()); const end = new Date(start); end.setDate(end.getDate() + 30); const selected = items.filter((item) => { const invoice = item.invoiceId ? invoices.find((value) => value.id === item.invoiceId) : null; const parsed = parseLocalDate(invoice?.dueDate || item.dueDate || item.date); if (!parsed || !isTransactionPending(item)) return false; const date = new Date(parsed.year, parsed.month - 1, parsed.day); return date >= start && date <= end }); return { transactions: selected, income: sum(selected.filter((item) => item.type === 'income')), expenses: sum(selected.filter((item) => item.type === 'expense')) } }
