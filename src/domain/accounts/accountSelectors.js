import { getTransactionAmount } from '../../utils/installmentValueCalculations.js'
import { isTransactionRealized } from '../../utils/financialSelectors.js'
import { getTransferAccountMovements, getTransferBalanceImpact } from '../transfers/transferSelectors.js'

export const UNASSIGNED_ACCOUNT_ID = '__unassigned__'
export const getVirtualUnassignedAccount = () => ({
  accountId: UNASSIGNED_ACCOUNT_ID,
  name: 'Sem conta definida',
  virtual: true,
  archived: false,
  includeInTotalBalance: false,
  initialBalance: 0,
})

const dateAtOrAfter = (value, base) => !base || String(value || '') >= String(base)
const localDate = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const transactionDate = (item) => item.paidAt?.slice(0, 10) || item.dueDate || item.date || ''
const paymentDate = (payment) => payment.paymentDate || payment.paidAt?.slice(0, 10) || ''
const isVirtualUnassigned = (accountId) => accountId === UNASSIGNED_ACCOUNT_ID || accountId === 'unassigned'
const cashTransaction = (item, accountId) => !item.cardId
  && item.transactionKind !== 'invoice-payment'
  && (isVirtualUnassigned(accountId) ? !item.accountId : item.accountId === accountId)
const signedAmount = (item) => (item.type === 'income' ? 1 : -1) * getTransactionAmount(item)

const directMovements = (transactions = [], accountId, { realized, baseDate } = {}) => transactions.filter((item) =>
  cashTransaction(item, accountId)
  && dateAtOrAfter(transactionDate(item), baseDate)
  && (realized === undefined || isTransactionRealized(item) === realized))

const paymentMovements = (invoiceRecords = [], accountId, { realized, baseDate } = {}) => invoiceRecords.flatMap((record) =>
  (record.paymentHistory || [])
    .filter((payment) =>
      (isVirtualUnassigned(accountId) ? !payment.accountId : payment.accountId === accountId)
      && dateAtOrAfter(paymentDate(payment), baseDate)
      && (realized === undefined || Boolean(payment.paidAt) === realized))
    .map((payment) => ({ ...payment, invoiceId: record.id, date: paymentDate(payment), type: 'expense', amount: Number(payment.amount || 0) })))

const transferMovements = (transfers = [], accountId, options = {}) => getTransferAccountMovements(transfers, accountId, {
  mode: options.realized === true ? 'realized' : options.realized === false ? 'projected' : 'history',
  referenceDate: options.referenceDate,
  baseDate: options.baseDate,
})

export const getAccountAssignmentStatus = (transaction) => transaction.cardId
  ? 'not-applicable'
  : transaction.accountId
    ? 'assigned'
    : transaction.accountAssignmentStatus || 'legacy-unassigned'

export const getAccountMovements = (transactions = [], invoiceRecords = [], accountId, options = {}) => [
  ...directMovements(transactions, accountId, options),
  ...paymentMovements(invoiceRecords, accountId, options),
  ...transferMovements(options.transfers || [], accountId, options),
]

export const getAccountIncome = (transactions = [], invoiceRecords = [], accountId, options = {}) =>
  directMovements(transactions, accountId, options)
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + getTransactionAmount(item), 0)

export const getAccountExpenses = (transactions = [], invoiceRecords = [], accountId, options = {}) =>
  getAccountMovements(transactions, invoiceRecords, accountId, options)
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + getTransactionAmount(item), 0)

export const getAccountRealizedBalance = (account, transactions = [], invoiceRecords = [], referenceDate = new Date(), transfers = []) => {
  if (!account) return 0
  const base = account.initialBalanceDate
  const cutoff = localDate(referenceDate)
  const direct = directMovements(transactions, account.accountId, { realized: true, baseDate: base })
    .filter((item) => transactionDate(item) <= cutoff)
    .reduce((sum, item) => sum + signedAmount(item), 0)
  const payments = paymentMovements(invoiceRecords, account.accountId, { realized: true, baseDate: base })
    .filter((item) => paymentDate(item) <= cutoff)
    .reduce((sum, item) => sum - getTransactionAmount(item), 0)
  const transferImpact = getTransferBalanceImpact(transfers, account.accountId, { mode: 'realized', referenceDate, baseDate: base })
  return Number(account.initialBalance || 0) + direct + payments + transferImpact
}

export const getAccountProjectedBalance = (account, transactions = [], invoiceRecords = [], referenceDate = new Date(), transfers = []) => {
  const realized = getAccountRealizedBalance(account, transactions, invoiceRecords, referenceDate, transfers)
  if (!account) return realized
  const planned = directMovements(transactions, account.accountId, { realized: false, baseDate: account.initialBalanceDate })
    .reduce((sum, item) => sum + signedAmount(item), 0)
  const plannedTransfers = getTransferBalanceImpact(transfers, account.accountId, { mode: 'projected', referenceDate, baseDate: account.initialBalanceDate })
  return realized + planned + plannedTransfers
}

export const getConsolidatedBalance = (accounts = [], transactions = [], invoiceRecords = [], referenceDate = new Date(), transfers = []) =>
  accounts
    .filter((account) => account.includeInTotalBalance && !account.archived)
    .reduce((sum, account) => sum + getAccountRealizedBalance(account, transactions, invoiceRecords, referenceDate, transfers), 0)

export const getConsolidatedProjectedBalance = (accounts = [], transactions = [], invoiceRecords = [], referenceDate = new Date(), transfers = []) =>
  accounts
    .filter((account) => account.includeInTotalBalance && !account.archived)
    .reduce((sum, account) => sum + getAccountProjectedBalance(account, transactions, invoiceRecords, referenceDate, transfers), 0)

export const getUnassignedTransactionsTotal = (transactions = [], invoiceRecords = []) =>
  getAccountMovements(transactions, invoiceRecords, UNASSIGNED_ACCOUNT_ID)
    .reduce((sum, item) => sum + signedAmount(item), 0)
