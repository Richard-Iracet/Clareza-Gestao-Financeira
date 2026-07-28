import { createInvoiceId, getInvoiceDates, getInvoicePeriod, isDuplicateInstallment, shiftInvoicePeriod } from './invoiceCalculations.js'

export const FINANCE_DATA_VERSION = 4
const TRANSACTIONS_KEY = 'clareza:transactions'
const CARDS_KEY = 'clareza:cards'
const INVOICES_KEY = 'clareza:invoices'
const VERSION_KEY = 'financeDataVersion'
const BACKUP_KEY = 'financeDataBackupBeforeInvoiceMigration'
const INSTALLMENT_BACKUP_KEY = 'financeDataBackupBeforeInstallmentProjectionV4'

const readJSON = (key, fallback) => {
  const raw = localStorage.getItem(key)
  return raw === null ? fallback : JSON.parse(raw)
}

const identifyCard = (transaction, cards) => {
  if (transaction.cardId) return cards.find((card) => card.id === transaction.cardId)
  const account = String(transaction.account || '').toLocaleLowerCase()
  if (account.includes('nubank')) return cards.find((card) => card.id === 'nubank')
  if (account.includes('ita')) return cards.find((card) => card.id === 'itau')
  return null
}

const parseInstallment = (value) => {
  const [number, total] = String(value || '1/1').split('/').map(Number)
  return { number: number || 1, total: total || 1 }
}

export const migrateLegacyTransactions = (transactions, cards) => transactions.map((transaction) => {
  if (transaction.type !== 'expense' || transaction.invoiceAssignmentMode) return transaction
  const card = identifyCard(transaction, cards)
  if (!card) return transaction
  const dueMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(transaction.dueDate || '')
  const isAugust2026 = dueMatch?.[1] === '2026' && dueMatch?.[2] === '08'
  let invoiceYear = transaction.invoiceYear
  let invoiceMonth = transaction.invoiceMonth
  let invoiceId = transaction.invoiceId
  if (isAugust2026) {
    invoiceYear = 2026; invoiceMonth = 8; invoiceId = createInvoiceId(card.id, invoiceYear, invoiceMonth)
  } else if (!invoiceYear || !invoiceMonth) {
    if (dueMatch) { invoiceYear = Number(dueMatch[1]); invoiceMonth = Number(dueMatch[2]) }
    else if (transaction.date) ({ invoiceYear, invoiceMonth } = getInvoicePeriod(transaction.date, card))
    else return transaction
    invoiceId ||= createInvoiceId(card.id, invoiceYear, invoiceMonth)
  } else invoiceId ||= createInvoiceId(card.id, invoiceYear, invoiceMonth)
  const installment = parseInstallment(transaction.installment)
  return {
    ...transaction, cardId: card.id, invoiceId, invoiceMonth, invoiceYear,
    invoiceStatus: transaction.invoiceStatus || (transaction.status === 'paid' ? 'paid' : 'open'),
    invoiceAssignmentMode: 'legacy-fixed', installmentNumber: transaction.installmentNumber || installment.number,
    installmentTotal: transaction.installmentTotal || installment.total,
    installmentAmount: transaction.installmentAmount ?? Number(transaction.amount),
    installmentGroupId: transaction.installmentGroupId || transaction.purchaseGroupId || null,
  }
})

const stableGroupId = (transaction) => {
  const source = [transaction.cardId, transaction.description, Number(transaction.amount), transaction.installmentTotal, transaction.category, transaction.costCenter].join('|').toLocaleLowerCase()
  let hash = 0
  for (let index = 0; index < source.length; index += 1) hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0
  return `legacy-installment-${Math.abs(hash)}`
}

export const projectRemainingLegacyInstallments = (transactions, cards) => {
  const normalized = transactions.map((transaction) => {
    if (!transaction.cardId) return transaction
    const parsed = parseInstallment(transaction.installment)
    const installmentNumber = Number(transaction.installmentNumber) || parsed.number
    const installmentTotal = Number(transaction.installmentTotal) || parsed.total
    if (installmentTotal <= 1) return { ...transaction, installmentNumber, installmentTotal }
    return { ...transaction, installmentNumber, installmentTotal, installmentAmount: transaction.installmentAmount ?? Number(transaction.amount), installmentGroupId: transaction.installmentGroupId || stableGroupId({ ...transaction, installmentTotal }) }
  })
  const result = [...normalized]
  normalized.forEach((source) => {
    if (!source.cardId || !source.invoiceMonth || !source.invoiceYear || source.installmentNumber >= source.installmentTotal) return
    const card = cards.find((item) => item.id === source.cardId)
    if (!card) return
    for (let number = source.installmentNumber + 1; number <= source.installmentTotal; number += 1) {
      const period = shiftInvoicePeriod(source.invoiceYear, source.invoiceMonth, number - source.installmentNumber)
      const dates = getInvoiceDates(card, period.invoiceYear, period.invoiceMonth)
      const candidate = {
        ...source, id: `projected-${source.installmentGroupId}-${number}`, status: 'pending', paidAt: null,
        invoiceStatus: 'open', invoiceAssignmentMode: source.invoiceAssignmentMode || 'legacy-fixed',
        invoiceId: createInvoiceId(card.id, period.invoiceYear, period.invoiceMonth), ...period, dueDate: dates.dueDate,
        amount: Number(source.installmentAmount ?? source.amount), installmentAmount: Number(source.installmentAmount ?? source.amount),
        installmentNumber: number, installment: `${number}/${source.installmentTotal}`, isProjectedInstallment: true,
        projectionCreatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      }
      if (!isDuplicateInstallment(candidate, result)) result.push(candidate)
    }
  })
  return result
}

export const runInvoiceMigration = (fallbackTransactions, fallbackCards) => {
  try {
    const version = Number(readJSON(VERSION_KEY, 0))
    const transactions = readJSON(TRANSACTIONS_KEY, fallbackTransactions)
    const storedCards = readJSON(CARDS_KEY, fallbackCards)
    if (version >= FINANCE_DATA_VERSION) return { transactions, cards: storedCards, migrated: false }
    const cards = storedCards.map((card) => card.id === 'nubank' ? { ...card, closingDay: 25, dueDay: 3 } : card)
    const existingIds = new Set(cards.map((card) => card.id))
    fallbackCards.forEach((card) => { if (!existingIds.has(card.id)) cards.push(card) })
    const legacyMigrated = version < 3 ? migrateLegacyTransactions(transactions, cards) : transactions
    const migrated = projectRemainingLegacyInstallments(legacyMigrated, cards)
    const valid = transactions.every((original) => {
      const preserved = migrated.find((item) => item.id === original.id)
      return preserved && preserved.description === original.description && Number(preserved.amount) === Number(original.amount)
    })
    if (!valid) throw new Error('A migração tentou alterar ou remover um lançamento existente.')
    const backup = { version, createdAt: new Date().toISOString(), transactions, cards: storedCards, invoices: readJSON(INVOICES_KEY, []) }
    if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, JSON.stringify(backup))
    if (localStorage.getItem(INSTALLMENT_BACKUP_KEY) === null) localStorage.setItem(INSTALLMENT_BACKUP_KEY, JSON.stringify(backup))
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(migrated))
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
    localStorage.setItem(VERSION_KEY, JSON.stringify(FINANCE_DATA_VERSION))
    return { transactions: migrated, cards, migrated: true }
  } catch (error) {
    console.error('Migração de faturas cancelada; os dados anteriores foram preservados.', error)
    return { transactions: fallbackTransactions, cards: fallbackCards, migrated: false, error: error.message }
  }
}
