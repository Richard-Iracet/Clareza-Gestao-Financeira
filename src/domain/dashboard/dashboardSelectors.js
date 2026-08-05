import { getConsolidatedBalance, getConsolidatedProjectedBalance } from '../accounts/accountSelectors.js'
import { getTransactionAmount } from '../../utils/installmentValueCalculations.js'
import { filterByCompetence, getFutureCommittedExpenses, getTransactionCompetence, isTransactionPending, isTransactionRealized } from '../../utils/financialSelectors.js'

const amount = (item) => Number(item?.totalPending ?? item?.amount ?? 0)
const dateOf = (item) => String(item?.dueDate || item?.date || '').slice(0, 10)
const inCompetence = (item, month, year) => Number(item?.invoiceMonth) === Number(month) && Number(item?.invoiceYear) === Number(year)
const openInvoice = (invoice) => invoice?.status !== 'paid' && amount(invoice) > 0
const cardName = (cards, cardId) => cards.find((card) => card.id === cardId)?.name || 'Cartão'
const accountName = (accounts, accountId) => accounts.find((account) => account.accountId === accountId)?.name || 'Sem conta definida'
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const atNoon = (value) => new Date(`${String(value).slice(0, 10)}T12:00:00`)
const validCycleDay = (value) => Math.min(31, Math.max(1, Number(value) || 25))
const monthDate = (year, monthIndex, day) => new Date(year, monthIndex, Math.min(day, new Date(year, monthIndex + 1, 0).getDate()), 12)
const financialDate = (item) => String(item?.paidAt || item?.receivedAt || item?.date || item?.dueDate || '').slice(0, 10)
const between = (value, start, end) => Boolean(value) && value >= start && value <= end

export const getFinancialCycle = (referenceDate = new Date(), configuredDay = 25) => {
  const day = validCycleDay(configuredDay)
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12)
  const thisMonth = monthDate(today.getFullYear(), today.getMonth(), day)
  const start = today >= thisMonth ? thisMonth : monthDate(today.getFullYear(), today.getMonth() - 1, day)
  const nextStart = monthDate(start.getFullYear(), start.getMonth() + 1, day)
  const end = new Date(nextStart); end.setDate(end.getDate() - 1)
  const previousStart = monthDate(start.getFullYear(), start.getMonth() - 1, day)
  const previousEnd = new Date(start); previousEnd.setDate(previousEnd.getDate() - 1)
  return { day, start: iso(start), end: iso(end), nextExpectedDate: iso(nextStart), previousStart: iso(previousStart), previousEnd: iso(previousEnd) }
}

export const isDateInFinancialCycle = (value, cycle) => between(String(value).slice(0, 10), cycle.start, cycle.end)
export const formatFinancialCycle = (cycle) => `${cycle.start.slice(8, 10)}/${cycle.start.slice(5, 7)} a ${cycle.end.slice(8, 10)}/${cycle.end.slice(5, 7)}`

const groupSum = (items, key) => Object.entries(items.reduce((groups, item) => { const label = key(item) || 'Outros'; groups[label] = (groups[label] || 0) + getTransactionAmount(item); return groups }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

export const getFinancialCycleSummary = ({ transactions = [], referenceDate = new Date(), cycleDay = 25 }) => {
  const cycle = getFinancialCycle(referenceDate, cycleDay)
  const today = iso(referenceDate)
  const inCurrentToToday = (item) => between(financialDate(item), cycle.start, today)
  const inPrevious = (item) => between(financialDate(item), cycle.previousStart, cycle.previousEnd)
  const incomes = transactions.filter((item) => item.type === 'income' && isTransactionRealized(item) && inCurrentToToday(item) && item.transactionKind !== 'invoice-payment')
  // Na visão de consumo, a compra no cartão é a despesa; pagamentos de fatura vivem apenas na visão de caixa da conta.
  const expenses = transactions.filter((item) => item.type === 'expense' && isTransactionRealized(item) && inCurrentToToday(item) && item.transactionKind !== 'invoice-payment')
  const previousIncome = transactions.filter((item) => item.type === 'income' && isTransactionRealized(item) && inPrevious(item) && item.transactionKind !== 'invoice-payment')
  const previousExpenses = transactions.filter((item) => item.type === 'expense' && isTransactionRealized(item) && inPrevious(item) && item.transactionKind !== 'invoice-payment')
  const sumItems = (items) => items.reduce((total, item) => total + getTransactionAmount(item), 0)
  const incomeTotal = sumItems(incomes); const expenseTotal = sumItems(expenses)
  return {
    cycle, incomes, expenses, incomeTotal, expenseTotal, result: incomeTotal - expenseTotal,
    previousIncomeTotal: sumItems(previousIncome), previousExpenseTotal: sumItems(previousExpenses),
    expenseByOrigin: groupSum(expenses, (item) => item.cardId ? 'Cartões' : /tarifa|juros/i.test(`${item.category || ''} ${item.description || ''}`) ? 'Tarifas e juros' : 'Contas'),
    expenseByCategory: groupSum(expenses, (item) => item.category || 'Sem categoria'),
    incomeBySource: groupSum(incomes, (item) => item.category || item.description || 'Outras receitas'),
    largestExpenses: [...expenses].sort((a, b) => getTransactionAmount(b) - getTransactionAmount(a)).slice(0, 5),
  }
}

export const getOpenInvoicesSummary = (invoices = [], cards = []) => {
  const eligible = invoices.filter((invoice) => ['open', 'closed', 'overdue'].includes(invoice.status) && amount(invoice) > 0).sort((left, right) => dateOf(left).localeCompare(dateOf(right)))
  // buildInvoices também chama competências futuras de "open"; a visão atual mantém só a próxima fatura pendente de cada cartão.
  const selectedCards = new Set()
  const items = eligible.filter((invoice) => { if (selectedCards.has(invoice.cardId)) return false; selectedCards.add(invoice.cardId); return true }).map((invoice) => ({ ...invoice, amount: amount(invoice), cardName: cardName(cards, invoice.cardId) }))
  return { items, total: items.reduce((total, item) => total + item.amount, 0), cardCount: new Set(items.map((item) => item.cardId)).size, nextDueDate: items.map(dateOf).filter(Boolean).sort()[0] || '' }
}

export const getAvailableUntilNextIncome = ({ accounts = [], transactions = [], invoices = [], invoicePayments = [], transfers = [], referenceDate = new Date(), cycleDay = 25 }) => {
  const cycle = getFinancialCycle(referenceDate, cycleDay); const today = iso(referenceDate); const end = cycle.nextExpectedDate
  const dueBefore = (item) => between(dateOf(item), today, end)
  const pendingIncome = transactions.filter((item) => item.type === 'income' && isTransactionPending(item) && !item.cardId && dueBefore(item))
  const pendingExpenses = transactions.filter((item) => item.type === 'expense' && isTransactionPending(item) && !item.cardId && item.transactionKind !== 'invoice-payment' && dueBefore(item))
  const dueInvoices = invoices.filter((invoice) => ['open', 'closed', 'overdue'].includes(invoice.status) && amount(invoice) > 0 && dueBefore(invoice))
  const scheduledTransfers = transfers.filter((item) => item.status === 'scheduled' && dueBefore(item))
  const sumTx = (items) => items.reduce((total, item) => total + getTransactionAmount(item), 0)
  const available = getConsolidatedBalance(accounts, transactions, invoicePayments, referenceDate, transfers)
  const income = sumTx(pendingIncome); const expenses = sumTx(pendingExpenses); const invoiceTotal = dueInvoices.reduce((total, item) => total + amount(item), 0); const transferTotal = scheduledTransfers.reduce((total, item) => total + Number(item.amount || 0) + Number(item.fee || 0), 0)
  return { cycle, available, pendingIncome, pendingExpenses, dueInvoices, scheduledTransfers, income, expenses, invoiceTotal, transferTotal, total: available + income - expenses - invoiceTotal - transferTotal }
}

export const getDashboardCompetence = (filters = {}, referenceDate = new Date()) => ({
  month: Number(filters.competenceMonth || referenceDate.getMonth() + 1),
  year: Number(filters.competenceYear || referenceDate.getFullYear()),
})

export const getCompetenceInvoices = (invoices = [], month, year) => invoices.filter((invoice) => inCompetence(invoice, month, year) && openInvoice(invoice))

export const getDashboardMonthlyDetails = ({ transactions = [], invoices = [], transfers = [], cards = [], accounts = [], month, year }) => {
  const scoped = filterByCompetence(transactions, month, year)
  const realizedIncome = scoped.filter((item) => item.type === 'income' && isTransactionRealized(item))
  const realizedExpenses = scoped.filter((item) => item.type === 'expense' && isTransactionRealized(item))
  const pendingIncome = scoped.filter((item) => item.type === 'income' && isTransactionPending(item) && !item.cardId)
  // Compras de cartão são representadas pela fatura, nunca somadas novamente como despesas diretas.
  const pendingDirectExpenses = scoped.filter((item) => item.type === 'expense' && isTransactionPending(item) && !item.cardId && item.transactionKind !== 'invoice-payment')
  const pendingInvoices = getCompetenceInvoices(invoices, month, year)
  const scheduledTransfers = transfers.filter((item) => item.status === 'scheduled' && (() => { const date = dateOf(item); return Number(date.slice(0, 4)) === Number(year) && Number(date.slice(5, 7)) === Number(month) })())
  const sumTransactions = (items) => items.reduce((total, item) => total + getTransactionAmount(item), 0)
  const invoiceTotal = pendingInvoices.reduce((total, item) => total + amount(item), 0)
  const transferTotal = scheduledTransfers.reduce((total, item) => total + Number(item.amount || 0) + Number(item.fee || 0), 0)
  return {
    realizedIncome, realizedExpenses, pendingIncome, pendingDirectExpenses, pendingInvoices, scheduledTransfers,
    incomeRealized: sumTransactions(realizedIncome), expensesRealized: sumTransactions(realizedExpenses),
    incomePending: sumTransactions(pendingIncome), directExpensesPending: sumTransactions(pendingDirectExpenses),
    invoicesPending: invoiceTotal, transfersPending: transferTotal,
    pendingTotal: sumTransactions(pendingDirectExpenses) + invoiceTotal + transferTotal,
    result: sumTransactions(realizedIncome) - sumTransactions(realizedExpenses),
    invoiceDetails: pendingInvoices.map((item) => ({ ...item, description: cardName(cards, item.cardId), amount: amount(item), origin: 'Fatura' })),
    transferDetails: scheduledTransfers.map((item) => ({ ...item, description: item.description || 'Transferência agendada', accountName: accountName(accounts, item.sourceAccountId), amount: Number(item.amount || 0) + Number(item.fee || 0), origin: 'Transferência' })),
  }
}

export const getDashboardProjection = ({ accounts = [], transactions = [], invoicePayments = [], transfers = [], referenceDate = new Date() }) => {
  const available = getConsolidatedBalance(accounts, transactions, invoicePayments, referenceDate, transfers)
  const projected = getConsolidatedProjectedBalance(accounts, transactions, invoicePayments, referenceDate, transfers)
  return { available, projected, netCommitments: projected - available }
}

export const getUpcomingFinancialEvents = ({ transactions = [], invoices = [], transfers = [], cards = [], accounts = [], referenceDate = new Date(), days = 30 }) => {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const end = new Date(start); end.setDate(end.getDate() + days)
  const inRange = (value) => { const date = new Date(`${String(value).slice(0, 10)}T12:00:00`); return !Number.isNaN(date.getTime()) && date >= start && date <= end }
  const invoiceIds = new Set(invoices.filter((invoice) => openInvoice(invoice) && inRange(dateOf(invoice))).map((invoice) => invoice.id))
  const events = [
    ...transactions.filter((item) => isTransactionPending(item) && !item.cardId && inRange(dateOf(item))).map((item) => ({ id: `transaction:${item.id}`, date: dateOf(item), description: item.description, origin: item.generatedFromRecurrence || item.recurrenceId ? 'Recorrência' : 'Lançamento', account: accountName(accounts, item.accountId), direction: item.type === 'income' ? 'in' : 'out', status: item.status || 'pending', amount: getTransactionAmount(item), source: item })),
    ...invoices.filter((invoice) => invoiceIds.has(invoice.id)).map((invoice) => ({ id: `invoice:${invoice.id}`, date: dateOf(invoice), description: `Fatura ${cardName(cards, invoice.cardId)}`, origin: 'Fatura', account: cardName(cards, invoice.cardId), direction: 'out', status: invoice.status, amount: amount(invoice), source: invoice })),
    ...transfers.filter((item) => item.status === 'scheduled' && inRange(dateOf(item))).map((item) => ({ id: `transfer:${item.transferId}`, date: dateOf(item), description: item.description || 'Transferência agendada', origin: 'Transferência', account: accountName(accounts, item.sourceAccountId), direction: 'out', status: item.status, amount: Number(item.amount || 0) + Number(item.fee || 0), source: item })),
  ]
  return events.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
}

export const getDashboardFutureCommitments = (transactions = [], referenceDate = new Date()) => ({
  total: getFutureCommittedExpenses(transactions, referenceDate),
  items: transactions.filter((item) => item.type === 'expense' && isTransactionPending(item) && (() => { const competence = getTransactionCompetence(item); return competence && competence.year * 12 + competence.month > referenceDate.getFullYear() * 12 + referenceDate.getMonth() + 1 })()),
})

export const getUnassignedDashboardInfo = (transactions = []) => {
  const items = transactions.filter((item) => !item.cardId && !item.accountId)
  return { items, count: items.length, total: items.reduce((total, item) => total + (item.type === 'income' ? 1 : -1) * getTransactionAmount(item), 0) }
}
