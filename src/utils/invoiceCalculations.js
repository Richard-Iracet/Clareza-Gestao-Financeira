import { advanceMonth, formatLocalISO, parseLocalDate, toLocalDate } from './dateCalculations.js'
import { distributePurchaseTotal, getTransactionAmount, normalizeInstallmentValues } from './installmentValueCalculations.js'
import { getCardBillingConfigForCompetence } from './cardBillingConfig.js'

export const createInvoiceId = (cardId, year, month) => `${cardId}-${year}-${String(month).padStart(2, '0')}`

export const getInvoicePeriod = (purchaseDate, cardOrClosingDay) => {
  const purchase = parseLocalDate(purchaseDate)
  if (!purchase) throw new Error('Data da compra inválida.')
  const card = typeof cardOrClosingDay === 'object' ? cardOrClosingDay : { closingDay: cardOrClosingDay, dueDay: Number(cardOrClosingDay) + 1 }
  const initial = getCardBillingConfigForCompetence(card, purchase.month, purchase.year); let config = initial.success ? initial.config : card
  let closesBeforeDueMonth = Number(config.dueDay) <= Number(config.closingDay); let offset = (purchase.day > config.closingDay ? 1 : 0) + (closesBeforeDueMonth ? 1 : 0); let period = advanceMonth(purchase.year, purchase.month, offset)
  const applicable = getCardBillingConfigForCompetence(card, period.month, period.year)
  if (applicable.success) { config = applicable.config; closesBeforeDueMonth = Number(config.dueDay) <= Number(config.closingDay); offset = (purchase.day > config.closingDay ? 1 : 0) + (closesBeforeDueMonth ? 1 : 0); period = advanceMonth(purchase.year, purchase.month, offset) }
  return { invoiceMonth: period.month, invoiceYear: period.year }
}

export const shiftInvoicePeriod = (year, month, offset) => {
  const period = advanceMonth(year, month, offset)
  return { invoiceMonth: period.month, invoiceYear: period.year }
}

export const getInvoiceDates = (card, year, month, customDates = {}) => {
  const applicable = getCardBillingConfigForCompetence(card, month, year); const config = applicable.success ? applicable.config : card
  const closesBeforeDueMonth = Number(config.dueDay) <= Number(config.closingDay)
  const closingPeriod = advanceMonth(year, month, closesBeforeDueMonth ? -1 : 0)
  return {
    closingDate: customDates.customClosingDate || customDates.closingDate || formatLocalISO(closingPeriod.year, closingPeriod.month, config.closingDay),
    dueDate: customDates.customDueDate || customDates.dueDate || formatLocalISO(year, month, config.dueDay),
  }
}

export const calculateInvoiceStatus = (invoice, today = new Date()) => {
  if (invoice.status === 'paid' || (invoice.paidAt && !invoice.reopenedAt)) return 'paid'
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const due = toLocalDate(invoice.dueDate)
  const closing = toLocalDate(invoice.closingDate)
  if (due && now > due) return 'overdue'
  if (closing && now > closing) return 'closed'
  return 'open'
}

export const buildInvoices = (transactions, cards, invoiceRecords = []) => {
  const records = new Map(invoiceRecords.map((item) => [item.id, item]))
  const grouped = new Map()
  transactions.filter((item) => item.cardId && item.invoiceId).forEach((item) => {
    if (!grouped.has(item.invoiceId)) grouped.set(item.invoiceId, [])
    grouped.get(item.invoiceId).push(item)
  })
  return [...grouped.entries()].map(([id, items]) => {
    const first = items[0]
    const card = cards.find((item) => item.id === first.cardId)
    if (!card) return null
    const record = records.get(id) || {}
    const dates = getInvoiceDates(card, first.invoiceYear, first.invoiceMonth, record)
    const paidFromItems = items.every((item) => item.status === 'paid')
    const invoice = {
      id, cardId: card.id, cardName: card.name, invoiceMonth: first.invoiceMonth, invoiceYear: first.invoiceYear,
      ...dates, customClosingDate: record.customClosingDate || null, customDueDate: record.customDueDate || null, dateSource: record.dateSource || 'card-default',
      paidAt: record.paidAt || items.find((item) => item.paidAt)?.paidAt || null,
      status: record.status || (paidFromItems ? 'paid' : null), transactions: items,
      total: items.reduce((sum, item) => sum + getTransactionAmount(item), 0),
      purchaseCount: new Set(items.map((item) => item.installmentGroupId || item.purchaseGroupId || item.id)).size,
      installmentCount: items.length,
      paymentHistory: record.paymentHistory || [], reopenHistory: record.reopenHistory || [], reopenedAt: record.reopenedAt || null, archived: Boolean(record.archived), record,
    }
    invoice.status = calculateInvoiceStatus(invoice)
    invoice.totalPaid = items.filter((item) => item.status === 'paid').reduce((sum, item) => sum + getTransactionAmount(item), 0)
    invoice.totalPending = items.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + getTransactionAmount(item), 0)
    return invoice
  }).filter((invoice) => invoice && !invoice.archived).sort((a, b) => b.invoiceYear - a.invoiceYear || b.invoiceMonth - a.invoiceMonth || a.cardName.localeCompare(b.cardName))
}

export const assignTransactionToInvoice = (transaction, card, mode = 'automatic') => {
  const period = getInvoicePeriod(transaction.date, card)
  return { ...transaction, cardId: card.id, account: card.name, ...period, invoiceId: createInvoiceId(card.id, period.invoiceYear, period.invoiceMonth), invoiceStatus: 'open', invoiceAssignmentMode: mode }
}

const createId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

export const createRemainingCardInstallments = (transaction, card) => {
  const installmentNumber = Math.max(1, Number.parseInt(transaction.installmentNumber, 10) || 1)
  const installmentTotal = Math.max(installmentNumber, Number.parseInt(transaction.installmentTotal ?? transaction.installments, 10) || 1)
  const calculatedPeriod = getInvoicePeriod(transaction.date, card)
  const initialPeriod = transaction.invoiceMonth && transaction.invoiceYear
    ? { invoiceMonth: Number(transaction.invoiceMonth), invoiceYear: Number(transaction.invoiceYear) }
    : calculatedPeriod
  const dividesTotal = transaction.installmentValueType === 'total'
  const distributed = dividesTotal ? distributePurchaseTotal(transaction.amount, installmentTotal) : null
  const installmentGroupId = transaction.installmentGroupId || createId()
  return Array.from({ length: installmentTotal - installmentNumber + 1 }, (_, index) => {
    const currentNumber = installmentNumber + index
    const period = shiftInvoicePeriod(initialPeriod.invoiceYear, initialPeriod.invoiceMonth, index)
    const amount = distributed ? distributed[currentNumber - 1] : Number(transaction.amount)
    const dates = getInvoiceDates(card, period.invoiceYear, period.invoiceMonth)
    return normalizeInstallmentValues({
      ...transaction, amount, installmentAmount: amount, account: card.name, cardId: card.id, dueDate: dates.dueDate,
      invoiceId: createInvoiceId(card.id, period.invoiceYear, period.invoiceMonth), ...period,
      invoiceStatus: 'open', invoiceAssignmentMode: 'automatic', status: 'pending',
      installmentGroupId, installmentNumber: currentNumber, installmentTotal, installment: `${currentNumber}/${installmentTotal}`,
      isProjectedInstallment: index > 0, projectionCreatedAt: index > 0 ? new Date().toISOString() : null,
      id: createId(),
      createdAt: new Date().toISOString(), valueInputMode: dividesTotal ? 'total' : 'installment', totalPurchaseAmount: dividesTotal ? Number(transaction.amount) : Number(transaction.amount) * installmentTotal,
      operationId: transaction.operationId || null, source: transaction.source || 'manual',
    }, { accountingAmount: amount })
  })
}

export const createCardInstallments = (transaction, card) => createRemainingCardInstallments({
  ...transaction, installmentNumber: 1, installmentTotal: transaction.installments,
  installmentValueType: 'total',
}, card)

export const isDuplicateInstallment = (candidate, transactions) => transactions.some((item) => (
  candidate.installmentGroupId && item.installmentGroupId === candidate.installmentGroupId && Number(item.installmentNumber) === Number(candidate.installmentNumber)
))
