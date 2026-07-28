export const indexById = (items = []) => new Map(items.map((item) => [item.id, item]))

export const groupBy = (items = [], field) => items.reduce((index, item) => {
  const key = item[field]
  if (!key) return index
  const group = index.get(key) || []
  group.push(item); index.set(key, group)
  return index
}, new Map())

export const buildFinanceIndexes = ({ transactions = [], cards = [], accounts = [], invoices = [], categories = [], recurrences = [] } = {}) => ({
  transactionsById: indexById(transactions), cardsById: indexById(cards), invoicesById: indexById(invoices),
  transactionsByInvoiceId: groupBy(transactions, 'invoiceId'), transactionsByInstallmentGroupId: groupBy(transactions, 'installmentGroupId'),
  transactionsByCardId: groupBy(transactions, 'cardId'), transactionsByAccountId: groupBy(transactions, 'accountId'), transactionsByCategory: groupBy(transactions, 'category'),
  accountsById: new Map(accounts.map((account) => [account.accountId, account])),
  categoriesById: new Map(categories.map((category) => [category, category])),
  recurrencesById: new Map(recurrences.map((recurrence) => [recurrence.recurrenceId, recurrence])),
})

export const getInvoiceTransactionsFromIndex = (indexes, invoiceId) => indexes.transactionsByInvoiceId.get(invoiceId) || []
