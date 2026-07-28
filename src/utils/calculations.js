import { isTransactionRealized } from './financialSelectors.js'

export const calculateSummary = (transactions) => {
  const paid = transactions.filter((item) => isTransactionRealized(item))
  const income = paid.filter((item) => item.type === 'income').reduce((sum, item) => sum + getTransactionAmount(item), 0)
  const expenses = paid.filter((item) => item.type === 'expense').reduce((sum, item) => sum + getTransactionAmount(item), 0)
  const pending = transactions
    .filter((item) => item.type === 'expense' && item.status === 'pending')
    .reduce((sum, item) => sum + getTransactionAmount(item), 0)
  const byNecessity = (necessity) => transactions
    .filter((item) => item.type === 'expense' && item.necessity === necessity)
    .reduce((sum, item) => sum + getTransactionAmount(item), 0)

  return {
    balance: income - expenses,
    income,
    expenses,
    pending,
    essential: byNecessity('essential'),
    superfluous: byNecessity('superfluous'),
    count: transactions.length,
  }
}

export const groupExpenses = (transactions, field) => transactions
  .filter((item) => item.type === 'expense')
  .reduce((groups, item) => {
    const key = item[field] || 'Não informado'
    groups[key] = (groups[key] || 0) + getTransactionAmount(item)
    return groups
  }, {})
import { getTransactionAmount } from './installmentValueCalculations.js'
