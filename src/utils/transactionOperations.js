import { getTransactionAmount } from './installmentValueCalculations.js'
import { isTransactionFuture, isTransactionOverdue, isTransactionRealized } from './financialSelectors.js'

export const getDeletionTargets = (transactions, id, scope = 'single') => {
  const target = transactions.find((item) => item.id === id)
  if (!target) return []
  if (scope === 'group' && target.installmentGroupId) return transactions.filter((item) => item.installmentGroupId === target.installmentGroupId)
  if (scope === 'future' && target.installmentGroupId) return transactions.filter((item) => item.installmentGroupId === target.installmentGroupId && Number(item.installmentNumber) >= Number(target.installmentNumber))
  return [target]
}

export const summarizeTransactions = (items = [], invoices = [], referenceDate = new Date()) => ({
  count: items.length,
  total: items.reduce((sum, item) => sum + getTransactionAmount(item), 0),
  paid: items.filter((item) => isTransactionRealized(item) || invoices.find((invoice) => invoice.id === item.invoiceId)?.status === 'paid').length,
  paidInvoices: new Set(items.filter((item) => invoices.find((invoice) => invoice.id === item.invoiceId)?.status === 'paid').map((item) => item.invoiceId)).size,
  invoices: new Set(items.map((item) => item.invoiceId).filter(Boolean)).size,
  installmentGroups: new Set(items.map((item) => item.installmentGroupId).filter(Boolean)).size,
  future: items.filter((item) => isTransactionFuture(item, referenceDate)).length,
  overdue: items.filter((item) => isTransactionOverdue(item, referenceDate, invoices)).length,
  competences: [...new Set(items.map((item) => item.invoiceMonth && item.invoiceYear ? `${String(item.invoiceMonth).padStart(2, '0')}/${item.invoiceYear}` : null).filter(Boolean))],
})

const safeBulkFields = new Set(['category', 'costCenter', 'necessity', 'status', 'notes'])
export const applySafeBulkUpdate = (transactions, ids, changes) => {
  const selected = new Set(ids)
  const safeChanges = Object.fromEntries(Object.entries(changes).filter(([key, value]) => safeBulkFields.has(key) && value !== ''))
  return transactions.map((item) => selected.has(item.id) ? { ...item, ...safeChanges } : item)
}
