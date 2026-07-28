export const ACCOUNT_TYPES = ['checking', 'digital', 'savings', 'cash', 'investment', 'other']

const now = () => new Date().toISOString()
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const isValidAccountDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const finite = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
const auditEntry = (type, options, createdAt) => ({
  eventId: id(),
  operationId: options.operationId || null,
  type,
  createdAt,
})
const appendAudit = (account, type, options, createdAt) => [
  ...(account.audit || []).slice(-49),
  auditEntry(type, options, createdAt),
]

export const validateAccount = (input = {}) => {
  const errors = []
  if (!String(input.name || '').trim()) errors.push('Informe o nome da conta.')
  if (!ACCOUNT_TYPES.includes(input.type)) errors.push('Selecione um tipo de conta v\u00e1lido.')
  if (input.currency !== 'BRL') errors.push('A moeda da conta deve ser BRL.')
  if (!finite(input.initialBalance)) errors.push('Informe um saldo inicial v\u00e1lido.')
  if (!isValidAccountDate(input.initialBalanceDate)) errors.push('Informe uma data-base v\u00e1lida para o saldo inicial.')
  return { valid: errors.length === 0, errors }
}

export const createAccount = (input = {}, options = {}) => {
  const createdAt = options.createdAt || now()
  const candidate = {
    accountId: options.accountId || id(),
    name: String(input.name || '').trim(),
    institution: String(input.institution || '').trim(),
    type: input.type || 'checking',
    currency: 'BRL',
    initialBalance: Number(input.initialBalance),
    initialBalanceDate: input.initialBalanceDate,
    includeInTotalBalance: input.includeInTotalBalance !== false,
    archived: false,
    archivedAt: null,
    color: input.color || null,
    icon: input.icon || null,
    notes: String(input.notes || '').trim(),
    createdAt,
    updatedAt: options.updatedAt || createdAt,
    audit: [auditEntry('account_created', options, createdAt)],
  }
  const validation = validateAccount(candidate)
  if (!validation.valid) return { success: false, errorCode: 'INVALID_ACCOUNT', errors: validation.errors }
  return { success: true, account: candidate }
}

export const updateAccount = (account, changes = {}, options = {}) => {
  if (!account) return { success: false, errorCode: 'ACCOUNT_NOT_FOUND', errors: ['Conta n\u00e3o encontrada.'] }
  const protectedChanges = { ...changes }
  delete protectedChanges.accountId
  delete protectedChanges.createdAt
  delete protectedChanges.audit
  const next = {
    ...account,
    ...protectedChanges,
    name: protectedChanges.name === undefined ? account.name : String(protectedChanges.name).trim(),
    institution: protectedChanges.institution === undefined ? account.institution : String(protectedChanges.institution).trim(),
    initialBalance: protectedChanges.initialBalance === undefined ? account.initialBalance : Number(protectedChanges.initialBalance),
    updatedAt: options.updatedAt || now(),
  }
  const validation = validateAccount(next)
  if (!validation.valid) return { success: false, errorCode: 'INVALID_ACCOUNT', errors: validation.errors }
  const initialChanged = next.initialBalance !== account.initialBalance || next.initialBalanceDate !== account.initialBalanceDate
  if (initialChanged && !options.confirmInitialBalanceChange) {
    return {
      success: false,
      requiresConfirmation: true,
      errorCode: 'INITIAL_BALANCE_CHANGE_REQUIRES_CONFIRMATION',
      account: next,
    }
  }
  return {
    success: true,
    account: {
      ...next,
      audit: appendAudit(account, initialChanged ? 'account_initial_balance_updated' : 'account_updated', options, next.updatedAt),
    },
  }
}

export const archiveAccount = (account, options = {}) => {
  if (!account) return { success: false, errorCode: 'ACCOUNT_NOT_FOUND' }
  if (account.archived) return { success: true, alreadyArchived: true, account }
  const at = options.at || now()
  return {
    success: true,
    account: {
      ...account,
      archived: true,
      archivedAt: at,
      updatedAt: at,
      audit: appendAudit(account, 'account_archived', options, at),
    },
  }
}

export const restoreAccount = (account, options = {}) => {
  if (!account) return { success: false, errorCode: 'ACCOUNT_NOT_FOUND' }
  if (!account.archived) return { success: true, alreadyRestored: true, account }
  const at = options.at || now()
  return {
    success: true,
    account: {
      ...account,
      archived: false,
      archivedAt: null,
      updatedAt: at,
      audit: appendAudit(account, 'account_restored', options, at),
    },
  }
}

export const hasAccountMovements = (accountId, transactions = [], invoiceRecords = [], transfers = [], recurrences = []) =>
  transactions.some((item) => item.accountId === accountId)
  || invoiceRecords.some((record) => (record.paymentHistory || []).some((payment) => payment.accountId === accountId))
  || transfers.some((transfer) => transfer?.sourceAccountId === accountId || transfer?.destinationAccountId === accountId)
  || recurrences.some((recurrence) => recurrence?.accountId === accountId || recurrence?.sourceAccountId === accountId || recurrence?.destinationAccountId === accountId)

export const deleteAccountSafely = (accounts = [], accountId, transactions = [], invoiceRecords = [], transfers = [], recurrences = []) => {
  const account = accounts.find((item) => item.accountId === accountId)
  if (!account) return { success: false, errorCode: 'ACCOUNT_NOT_FOUND' }
  const transactionCount = transactions.filter((item) => item.accountId === accountId).length
  const invoicePaymentCount = invoiceRecords.reduce((count, record) => count + (record.paymentHistory || []).filter((payment) => payment.accountId === accountId).length, 0)
  const transferCount = transfers.filter((transfer) => transfer?.sourceAccountId === accountId || transfer?.destinationAccountId === accountId).length
  const recurrenceCount = recurrences.filter((recurrence) => recurrence?.accountId === accountId || recurrence?.sourceAccountId === accountId || recurrence?.destinationAccountId === accountId).length
  if (transactionCount || invoicePaymentCount || transferCount || recurrenceCount) {
    return { success: false, errorCode: 'ACCOUNT_HAS_MOVEMENTS', transactionCount, invoicePaymentCount, transferCount, recurrenceCount }
  }
  return { success: true, accounts: accounts.filter((item) => item.accountId !== accountId) }
}
