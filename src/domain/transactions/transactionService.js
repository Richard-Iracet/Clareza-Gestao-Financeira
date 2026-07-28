import { applySafeBulkUpdate, getDeletionTargets } from '../../utils/transactionOperations.js'
import { isTransactionRealized } from '../../utils/financialSelectors.js'

export const deleteTransactionByScope = (transactions, id, scope = 'single') => {
  const ids = new Set(getDeletionTargets(transactions, id, scope).map((item) => item.id))
  return transactions.filter((item) => !ids.has(item.id))
}

export const batchUpdateTransactions = (transactions, ids, changes) => applySafeBulkUpdate(transactions, ids, changes)
export const batchDeleteTransactions = (transactions, ids) => { const selected = new Set(ids); return transactions.filter((item) => !selected.has(item.id)) }
export const toggleCashTransactionStatus = (transactions, id) => transactions.map((item) => {
  if (item.id !== id || item.cardId) return item
  const realized = isTransactionRealized(item)
  const timestamp = realized ? null : new Date().toISOString()
  return item.type === 'income'
    ? { ...item, status: realized ? 'pending' : 'received', receivedAt: timestamp, paidAt: null }
    : { ...item, status: realized ? 'pending' : 'paid', paidAt: timestamp, receivedAt: null }
})
