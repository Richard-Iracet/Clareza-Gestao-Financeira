import { getAppMetadata } from '../../config/appMetadata.js'
import { getAccountRealizedBalance, getConsolidatedBalance, getConsolidatedProjectedBalance } from '../accounts/accountSelectors.js'
import { getFinancialCycleSummary } from '../dashboard/dashboardSelectors.js'
import { analyzeFinanceData } from '../../utils/financeDiagnostics.js'
import { buildInvoices } from '../../utils/invoiceCalculations.js'
import { getMonthlyFinancialSummary, getNextThirtyDaysSummary, getTransactionAccountingAmount, getTransactionCompetence, getFutureCommittedExpenses, isTransactionPending, isTransactionRealized } from '../../utils/financialSelectors.js'
import { buildMonthlyForecast } from '../../utils/forecastCalculations.js'
import { checksum } from '../../utils/snapshot.js'

const money = (value) => Math.round((Number(value) || 0) * 100) / 100
const sorted = (items, key = (item) => String(item?.id || item?.accountId || item?.cardId || item?.transferId || item?.recurrenceId || item?.alertKey || item?.label || item)) => [...items].sort((a, b) => key(a).localeCompare(key(b)))
const sum = (items, predicate = () => true) => money(items.filter(predicate).reduce((total, item) => total + getTransactionAccountingAmount(item), 0))
const group = (items, key, amount = getTransactionAccountingAmount) => sorted(Object.entries(items.reduce((out, item) => { const id = String(key(item) || 'unassigned'); out[id] = money((out[id] || 0) + amount(item)); return out }, {})).map(([id, value]) => ({ id, value })), (item) => item.id)
const monthKey = (item) => { const c = getTransactionCompetence(item); return c ? `${c.year}-${String(c.month).padStart(2, '0')}` : null }

export const createBaselineReport = (state = {}, options = {}) => {
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date(options.referenceDate || Date.now())
  const generatedAt = options.generatedAt || referenceDate.toISOString()
  const transactions = sorted(state.transactions || []), cards = sorted(state.cards || []), accounts = sorted(state.accounts || []), transfers = sorted(state.transfers || []), recurrences = sorted(state.recurrences || []), alertStates = sorted(state.alertStates || []), categories = sorted(state.categories || []), invoiceRecords = sorted(state.invoiceRecords || [])
  const invoices = buildInvoices(transactions, cards, invoiceRecords)
  const periods = [...new Set(transactions.map(monthKey).filter(Boolean))].sort()
  const byPeriod = periods.map((period) => { const [year, month] = period.split('-').map(Number); const value = getMonthlyFinancialSummary(transactions, invoices, month, year, referenceDate); return { period, incomeRealized: money(value.incomeRealized), expensesRealized: money(value.expensesRealized), incomePending: money(value.incomeForecast), expensesPending: money(value.expensesForecast), invoices: money(invoices.filter((i) => Number(i.invoiceMonth) === month && Number(i.invoiceYear) === year).reduce((t, i) => t + Number(i.totalPending || 0), 0)), transfers: money(transfers.filter((t) => String(t.date || t.dueDate || '').startsWith(period)).reduce((v, t) => v + Number(t.amount || 0), 0)), result: money(value.realizedBalance), projection: money(value.projectedBalance) } })
  const diagnostics = analyzeFinanceData({ transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoiceRecords, financeVersion: state.migrations?.financeDataVersion })
  delete diagnostics.generatedAt
  const metadata = { ...getAppMetadata(options.environment), generatedAt, snapshotId: options.snapshot?.snapshotId || options.snapshotId || null, revision: options.snapshot?.revision || options.revision || null, snapshotChecksum: options.snapshot?.checksum || options.snapshotChecksum || null }
  const cycle = getFinancialCycleSummary({ transactions, referenceDate, cycleDay: state.userSettings?.financialCycleDay || 25 })
  const next30 = getNextThirtyDaysSummary(transactions, invoices, referenceDate)
  const report = {
    format: 'clareza-financial-baseline', version: 1, metadata,
    counts: { transactions: transactions.length, accounts: accounts.length, cards: cards.length, invoiceRecords: invoiceRecords.length, transfers: transfers.length, recurrences: recurrences.length, recurrenceOccurrences: [...transactions, ...transfers].filter((i) => i.recurrenceOccurrenceId).length, categories: categories.length, costCenters: (state.costCenters || []).length, alertStates: alertStates.length, installmentGroups: new Set(transactions.map((i) => i.installmentGroupId).filter(Boolean)).size, installments: transactions.filter((i) => Number(i.installmentTotal) > 1).length },
    integrity: { healthy: diagnostics.healthy, summary: diagnostics.summary, issues: diagnostics.issues },
    totals: {
      global: { consolidatedBalance: money(getConsolidatedBalance(accounts, transactions, invoiceRecords, referenceDate, transfers)), projectedBalance: money(getConsolidatedProjectedBalance(accounts, transactions, invoiceRecords, referenceDate, transfers)), incomeRealized: sum(transactions, (i) => i.type === 'income' && isTransactionRealized(i)), expensesRealized: sum(transactions, (i) => i.type === 'expense' && isTransactionRealized(i)), incomePending: sum(transactions, (i) => i.type === 'income' && isTransactionPending(i)), expensesPending: sum(transactions, (i) => i.type === 'expense' && isTransactionPending(i)), openInvoiceBalance: money(invoices.filter((i) => i.status !== 'paid').reduce((t, i) => t + Number(i.totalPending || 0), 0)), futureCommitments: money(getFutureCommittedExpenses(transactions, referenceDate)), financialCycleResult: money(cycle.result), nextThirtyDays: { income: money(next30.income), expenses: money(next30.expenses) } },
      byPeriod, byAccount: sorted(accounts.map((account) => ({ id: account.accountId, name: account.name, balance: money(getAccountRealizedBalance(account, transactions, invoiceRecords, referenceDate, transfers)) })), (i) => i.id),
      byCard: group(transactions.filter((i) => i.cardId), (i) => i.cardId), byCategory: group(transactions, (i) => i.category || 'uncategorized'), byCostCenter: group(transactions, (i) => i.costCenter || 'unassigned'),
      invoices: sorted(invoices.map((i) => ({ id: i.id, cardId: i.cardId, period: `${i.invoiceYear}-${String(i.invoiceMonth).padStart(2, '0')}`, total: money(i.total), pending: money(i.totalPending) })), (i) => i.id),
      transfers: Object.fromEntries(['completed', 'scheduled', 'cancelled', 'reversed'].map((status) => [status, { count: transfers.filter((i) => (i.reversal ? 'reversed' : i.status) === status).length, total: money(transfers.filter((i) => (i.reversal ? 'reversed' : i.status) === status).reduce((t, i) => t + Number(i.amount || 0), 0)) }])),
      forecast: buildMonthlyForecast(transactions, invoices, options.forecastMonths || 6, referenceDate),
    },
  }
  return { ...report, reportChecksum: checksum(report) }
}
