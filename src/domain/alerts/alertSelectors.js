import { getAccountProjectedBalance, getAccountRealizedBalance } from '../accounts/accountSelectors.js'
import { getTransferAccountMovements } from '../transfers/transferSelectors.js'
import { getTransactionAmount } from '../../utils/installmentValueCalculations.js'
import { isTransactionPending } from '../../utils/financialSelectors.js'
import {
  getOccurrenceKeyFromRecord,
  isValidRecurrenceDate,
  toLocalDateString,
  validateRecurrenceRecord,
} from '../recurrences/recurrenceService.js'

export const ALERT_SEVERITIES = ['critical', 'high', 'medium', 'low']
export const DEFAULT_DUE_SOON_DAYS = 7

const now = () => new Date().toISOString()
const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const compareDates = (left, right) => String(left || '').localeCompare(String(right || ''))
const validDate = (value) => isValidRecurrenceDate(value)
const text = (value) => String(value ?? '').trim()

const dateParts = (value) => {
  if (!validDate(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}
const epochDay = (value) => {
  const parts = dateParts(value)
  return parts ? Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000) : null
}
const dayDifference = (from, to) => {
  const start = epochDay(from)
  const end = epochDay(to)
  return start === null || end === null ? null : end - start
}
const severityRank = (value) => ALERT_SEVERITIES.indexOf(value)

/** Stable keys keep transient alerts separate from persisted user state. */
export const getAlertKey = (type, ...parts) => [type, ...parts.map((part) => encodeURIComponent(String(part ?? '')))].join(':')

export const normalizeAlertState = (input = {}, options = {}) => ({
  alertStateId: text(input.alertStateId || options.alertStateId) || identifier(),
  alertKey: text(input.alertKey || options.alertKey),
  read: Boolean(input.read),
  dismissed: Boolean(input.dismissed),
  dismissedAt: input.dismissedAt || null,
  snoozedUntil: validDate(input.snoozedUntil) ? input.snoozedUntil : null,
  createdAt: input.createdAt || options.createdAt || now(),
  updatedAt: input.updatedAt || options.updatedAt || now(),
})

const stateCollection = (alertStates) => Array.isArray(alertStates)
  ? alertStates
  : Object.entries(alertStates || {}).map(([alertKey, state]) => ({ alertKey, ...(state || {}) }))

export const getAlertState = (alertStates, alertKey) => {
  const record = stateCollection(alertStates).find((state) => state?.alertKey === alertKey)
  return record ? normalizeAlertState(record) : normalizeAlertState({ alertKey })
}

export const upsertAlertState = (alertStates = [], input = {}, options = {}) => {
  const state = normalizeAlertState(input, options)
  if (!state.alertKey) return Array.isArray(alertStates) ? alertStates : stateCollection(alertStates)
  const records = stateCollection(alertStates)
  return [...records.filter((item) => item?.alertKey !== state.alertKey), state]
}

export const markAlertRead = (alertStates, alertKey, options = {}) => upsertAlertState(alertStates, {
  ...getAlertState(alertStates, alertKey),
  alertKey,
  read: true,
  updatedAt: options.updatedAt || now(),
})

export const dismissAlert = (alertStates, alertKey, options = {}) => upsertAlertState(alertStates, {
  ...getAlertState(alertStates, alertKey),
  alertKey,
  dismissed: true,
  dismissedAt: options.dismissedAt || options.updatedAt || now(),
  updatedAt: options.updatedAt || now(),
})

export const snoozeAlert = (alertStates, alertKey, snoozedUntil, options = {}) => {
  if (!validDate(snoozedUntil)) return { success: false, errorCode: 'INVALID_SNOOZE_DATE', alertStates: stateCollection(alertStates) }
  return {
    success: true,
    alertStates: upsertAlertState(alertStates, {
      ...getAlertState(alertStates, alertKey),
      alertKey,
      dismissed: false,
      snoozedUntil,
      updatedAt: options.updatedAt || now(),
    }),
  }
}

export const restoreAlert = (alertStates, alertKey, options = {}) => upsertAlertState(alertStates, {
  ...getAlertState(alertStates, alertKey),
  alertKey,
  dismissed: false,
  dismissedAt: null,
  snoozedUntil: null,
  updatedAt: options.updatedAt || now(),
})

export const isAlertSuppressed = (alert, alertStates = [], referenceDate = new Date()) => {
  const state = getAlertState(alertStates, alert?.alertKey)
  const reference = toLocalDateString(referenceDate)
  return state.dismissed || Boolean(state.snoozedUntil && reference && compareDates(state.snoozedUntil, reference) >= 0)
}

export const withAlertState = (alert, alertStates = [], referenceDate = new Date()) => {
  const state = getAlertState(alertStates, alert.alertKey)
  return {
    ...alert,
    state,
    read: state.read,
    dismissed: state.dismissed,
    snoozedUntil: state.snoozedUntil,
    visible: !isAlertSuppressed(alert, alertStates, referenceDate),
  }
}

const createAlert = (type, details = {}) => ({
  alertKey: details.alertKey || getAlertKey(type, details.id || details.transactionId || details.invoiceId || details.recurrenceId || details.accountId || details.transferId || '', details.date || ''),
  type,
  severity: details.severity || 'medium',
  title: details.title || 'Atenção financeira',
  description: details.description || '',
  date: details.date || null,
  amount: details.amount === undefined ? null : Number(details.amount),
  transactionId: details.transactionId || null,
  invoiceId: details.invoiceId || null,
  recurrenceId: details.recurrenceId || null,
  recurrenceDescription: details.recurrenceDescription || null,
  accountId: details.accountId || null,
  accountName: details.accountName || null,
  transferId: details.transferId || null,
  metadata: details.metadata || {},
})

const urgency = (date, referenceDate, soonDays) => {
  const distance = dayDifference(referenceDate, date)
  if (distance === null) return null
  if (distance < 0) return 'overdue'
  if (distance === 0) return 'today'
  if (distance <= soonDays) return 'soon'
  return null
}

const dueDateForTransaction = (transaction, invoicesById) => invoicesById.get(transaction.invoiceId)?.dueDate || transaction.dueDate || transaction.date
const transactionLabel = (transaction) => text(transaction.description) || 'Lançamento sem descrição'

const transactionAlerts = (transactions, invoicesById, referenceDate, soonDays) => transactions.flatMap((transaction) => {
  if (!transaction || transaction.cardId || !isTransactionPending(transaction)) return []
  const dueDate = dueDateForTransaction(transaction, invoicesById)
  const due = urgency(dueDate, referenceDate, soonDays)
  if (!due) return []
  const isIncome = transaction.type === 'income'
  const titlePrefix = isIncome ? 'Receita esperada' : 'Despesa'
  const label = transactionLabel(transaction)
  const type = isIncome ? `expected-income-${due}` : `transaction-${due}`
  const title = due === 'overdue' ? `${titlePrefix} em atraso` : due === 'today' ? `${titlePrefix} para hoje` : `${titlePrefix} próxima do vencimento`
  const description = due === 'overdue'
    ? `${label} está pendente desde ${dueDate}.`
    : `${label} vence em ${dueDate}.`
  return [createAlert(type, {
    transactionId: transaction.id,
    id: transaction.id,
    date: dueDate,
    amount: getTransactionAmount(transaction),
    severity: due === 'overdue' ? 'high' : due === 'today' ? 'high' : 'medium',
    title,
    description,
  })]
})

const invoiceAlerts = (invoices, referenceDate, soonDays) => invoices.flatMap((invoice) => {
  if (!invoice || invoice.status === 'paid' || Number(invoice.totalPending || 0) <= 0) return []
  const due = urgency(invoice.dueDate, referenceDate, soonDays)
  if (!due) return []
  const type = `invoice-${due}`
  const title = due === 'overdue' ? 'Fatura em atraso' : due === 'today' ? 'Fatura vence hoje' : 'Fatura próxima do vencimento'
  return [createAlert(type, {
    invoiceId: invoice.id,
    id: invoice.id,
    date: invoice.dueDate,
    amount: invoice.totalPending,
    severity: due === 'overdue' ? 'critical' : due === 'today' ? 'high' : 'medium',
    title,
    description: `${invoice.cardName || 'Cartão'} possui R$ ${Number(invoice.totalPending || 0).toFixed(2)} pendentes com vencimento em ${invoice.dueDate}.`,
  })]
})

const occurrenceDate = (record) => record?.scheduledOccurrenceDate || record?.date || ''
const pendingRecurrenceOccurrence = (entry) => entry.kind === 'transfer'
  ? entry.record.status === 'scheduled'
  : isTransactionPending(entry.record)

const recurrenceAlerts = (recurrences, transactions, transfers, referenceDate) => {
  const recordsByRecurrence = new Map()
  const add = (record, kind) => {
    if (!record?.recurrenceId) return
    const list = recordsByRecurrence.get(record.recurrenceId) || []
    list.push({ record, kind })
    recordsByRecurrence.set(record.recurrenceId, list)
  }
  transactions.forEach((record) => add(record, 'transaction'))
  transfers.forEach((record) => add(record, 'transfer'))
  return recurrences.flatMap((recurrence) => {
    if (!recurrence) return []
    const entries = recordsByRecurrence.get(recurrence.recurrenceId) || []
    const futureEntries = entries
      .filter(pendingRecurrenceOccurrence)
      .filter((entry) => validDate(occurrenceDate(entry.record)) && compareDates(occurrenceDate(entry.record), referenceDate) >= 0)
      .sort((left, right) => compareDates(occurrenceDate(left.record), occurrenceDate(right.record)))
    const upcoming = futureEntries[0]
    const fallbackDate = validDate(recurrence.nextOccurrenceDate) ? recurrence.nextOccurrenceDate : null
    const date = upcoming ? occurrenceDate(upcoming.record) : fallbackDate
    const due = date ? urgency(date, referenceDate, Number(recurrence.reminderDaysBefore || 0)) : null
    const alerts = []
    if (recurrence.status === 'active' && due) {
      alerts.push(createAlert('recurrence-upcoming', {
        recurrenceId: recurrence.recurrenceId,
        id: recurrence.recurrenceId,
        date,
        amount: upcoming ? Number(upcoming.record.amount || recurrence.amount) : Number(recurrence.amount),
        severity: due === 'today' ? 'medium' : 'low',
        title: due === 'today' ? 'Recorrência para hoje' : 'Recorrência próxima',
        description: `${recurrence.description} possui ocorrência prevista para ${date}.`,
      }))
    }
    if (recurrence.status === 'paused' && futureEntries.length) {
      alerts.push(createAlert('paused-recurrence-with-future-occurrences', {
        recurrenceId: recurrence.recurrenceId,
        id: recurrence.recurrenceId,
        date: occurrenceDate(futureEntries[0].record),
        severity: 'medium',
        title: 'Recorrência pausada possui ocorrências futuras',
        description: `${recurrence.description} está pausada, mas ainda há ${futureEntries.length} ocorrência(s) pendente(s) já gerada(s).`,
        metadata: { occurrenceCount: futureEntries.length },
      }))
    }
    return alerts
  })
}

const recurrenceIntegrityAlerts = (recurrences, transfers, accounts, cards) => {
  const recurrenceById = new Map(recurrences.map((recurrence) => [recurrence?.recurrenceId, recurrence]))
  const alerts = recurrences.flatMap((recurrence) => {
    const validation = validateRecurrenceRecord(recurrence, { accounts, cards, allowArchived: true })
    if (validation.valid) return []
    return [createAlert('invalid-recurrence-reference', {
      recurrenceId: recurrence?.recurrenceId,
      id: recurrence?.recurrenceId || 'invalid',
      severity: 'high',
      title: 'Recorrência com referências inválidas',
      description: validation.errors.join(' '),
      metadata: { errors: validation.errors },
    })]
  })
  transfers.forEach((transfer) => {
    if (!transfer?.recurrenceId) return
    const recurrence = recurrenceById.get(transfer.recurrenceId)
    const expectedKey = recurrence ? getOccurrenceKeyFromRecord({
      recurrenceId: recurrence.recurrenceId,
      recurrenceType: 'transfer',
      scheduledOccurrenceDate: occurrenceDate(transfer),
    }) : ''
    const actualKey = getOccurrenceKeyFromRecord(transfer)
    const inconsistent = !recurrence
      || recurrence.type !== 'transfer'
      || transfer.recurrenceType && transfer.recurrenceType !== 'transfer'
      || !validDate(occurrenceDate(transfer))
      || (expectedKey && actualKey && expectedKey !== actualKey)
    if (!inconsistent) return
    alerts.push(createAlert('inconsistent-recurring-transfer', {
      transferId: transfer.transferId,
      recurrenceId: transfer.recurrenceId,
      id: transfer.transferId || transfer.recurrenceId,
      date: occurrenceDate(transfer) || null,
      severity: 'high',
      title: 'Transferência recorrente inconsistente',
      description: 'A transferência recorrente não corresponde a uma regra válida ou à sua identidade de ocorrência.',
    }))
  })
  return alerts
}

const recurrenceGenerationFailureAlerts = (recurrences) => recurrences.flatMap((recurrence) => {
  if (!recurrence?.generationError) return []
  return [createAlert('recurrence-generation-failed', {
    recurrenceId: recurrence.recurrenceId,
    recurrenceDescription: recurrence.description || null,
    id: recurrence.recurrenceId,
    date: recurrence.generationFailedAt || recurrence.updatedAt || null,
    severity: 'high',
    title: 'Falha ao gerar recorrência',
    description: `${recurrence.description || 'A recorrência'} não foi atualizada: ${recurrence.generationError}`,
    metadata: { generationFailedAt: recurrence.generationFailedAt || null },
  })]
})

const plannedAccountTimeline = (account, transactions, invoiceRecords, transfers, referenceDate) => {
  const baseDate = account.initialBalanceDate || ''
  const movements = []
  ;(Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    if (!transaction || transaction.cardId || transaction.transactionKind === 'invoice-payment' || transaction.accountId !== account.accountId || !isTransactionPending(transaction)) return
    const sourceDate = transaction.dueDate || transaction.date || ''
    if (!validDate(sourceDate) || (baseDate && sourceDate < baseDate)) return
    movements.push({
      date: sourceDate < referenceDate ? referenceDate : sourceDate,
      signedAmount: transaction.type === 'income' ? getTransactionAmount(transaction) : -getTransactionAmount(transaction),
      description: transaction.description || 'Lançamento previsto',
      kind: 'transaction',
    })
  })
  getTransferAccountMovements(transfers, account.accountId, { mode: 'projected', referenceDate, baseDate }).forEach((movement) => {
    if (!validDate(movement.date)) return
    movements.push({
      date: movement.date < referenceDate ? referenceDate : movement.date,
      signedAmount: Number(movement.signedAmount || 0),
      description: movement.description || 'Transferência agendada',
      kind: 'transfer',
    })
  })
  const realized = getAccountRealizedBalance(account, transactions, invoiceRecords, referenceDate, transfers)
  const ordered = movements.sort((left, right) => compareDates(left.date, right.date) || left.signedAmount - right.signedAmount)
  let balance = realized
  let firstNegative = null
  ordered.forEach((movement) => {
    balance += movement.signedAmount
    if (!firstNegative && balance < 0) firstNegative = { date: movement.date, balance, movement }
  })
  return { realized, finalBalance: balance, firstNegative, movements: ordered }
}

const projectedBalanceAlerts = (accounts, transactions, invoiceRecords, transfers, referenceDate) => accounts.flatMap((account) => {
  if (!account || account.archived) return []
  const projectedBalance = getAccountProjectedBalance(account, transactions, invoiceRecords, referenceDate, transfers)
  if (projectedBalance >= 0) return []
  const timeline = plannedAccountTimeline(account, transactions, invoiceRecords, transfers, referenceDate)
  const negative = timeline.firstNegative || { date: referenceDate, balance: projectedBalance, movement: null }
  const principalOutflows = timeline.movements.filter((movement) => movement.signedAmount < 0).slice(0, 3).map((movement) => ({ date: movement.date, description: movement.description, amount: Math.abs(movement.signedAmount) }))
  return [createAlert('negative-projected-account-balance', {
    accountId: account.accountId,
    accountName: account.name,
    id: account.accountId,
    severity: 'high',
    title: 'Saldo projetado negativo',
    date: negative.date,
    description: `${account.name} deve ficar negativo em ${negative.date}, com saldo projetado de R$ ${Number(negative.balance).toFixed(2)}.`,
    amount: projectedBalance,
    metadata: { projectedBalance, firstNegativeDate: negative.date, firstNegativeBalance: negative.balance, amountNeeded: Math.abs(Number(negative.balance || 0)), principalOutflows },
  })]
})

/**
 * Read-only alert derivation. It never writes transactions, transfers, invoices,
 * accounts, or recurrences; only callers may persist the separate alert state.
 */
export const deriveFinanceAlerts = (input = {}) => {
  const referenceDate = toLocalDateString(input.referenceDate || new Date())
  if (!referenceDate) return []
  const transactions = Array.isArray(input.transactions) ? input.transactions : []
  const transfers = Array.isArray(input.transfers) ? input.transfers : []
  const invoices = Array.isArray(input.invoices) ? input.invoices : []
  const invoiceRecords = Array.isArray(input.invoiceRecords) ? input.invoiceRecords : []
  const accounts = Array.isArray(input.accounts) ? input.accounts : []
  const cards = Array.isArray(input.cards) ? input.cards : []
  const recurrences = Array.isArray(input.recurrences) ? input.recurrences : []
  const invoicesById = new Map(invoices.map((invoice) => [invoice?.id, invoice]))
  const soonDays = Number.isInteger(Number(input.dueSoonDays)) && Number(input.dueSoonDays) >= 0 ? Number(input.dueSoonDays) : DEFAULT_DUE_SOON_DAYS
  const alerts = [
    ...transactionAlerts(transactions, invoicesById, referenceDate, soonDays),
    ...invoiceAlerts(invoices, referenceDate, soonDays),
    ...recurrenceAlerts(recurrences, transactions, transfers, referenceDate),
    ...recurrenceIntegrityAlerts(recurrences, transfers, accounts, cards),
    ...recurrenceGenerationFailureAlerts(recurrences),
    ...projectedBalanceAlerts(accounts, transactions, invoiceRecords, transfers, referenceDate),
  ]
  const unique = new Map()
  alerts.forEach((alert) => { if (!unique.has(alert.alertKey)) unique.set(alert.alertKey, alert) })
  return [...unique.values()].sort((left, right) => severityRank(left.severity) - severityRank(right.severity)
    || compareDates(left.date || '9999-12-31', right.date || '9999-12-31')
    || left.title.localeCompare(right.title, 'pt-BR'))
}

export const selectVisibleAlerts = (alerts = [], alertStates = [], referenceDate = new Date()) =>
  alerts.map((alert) => withAlertState(alert, alertStates, referenceDate)).filter((alert) => alert.visible)

export const buildFinanceAlerts = (input = {}) => {
  const all = deriveFinanceAlerts(input).map((alert) => withAlertState(alert, input.alertStates || [], input.referenceDate || new Date()))
  const visible = all.filter((alert) => alert.visible)
  const counts = all.reduce((result, alert) => {
    result.total += 1
    if (alert.visible) result.visible += 1
    if (alert.visible && alert.severity === 'critical') result.critical += 1
    if (alert.visible && alert.severity === 'high') result.high += 1
    if (!alert.state.read && alert.visible) result.unread += 1
    return result
  }, { total: 0, visible: 0, critical: 0, high: 0, unread: 0 })
  return { all, visible, counts }
}

/** Keeps only state rows that refer to alerts still currently derived. */
export const pruneAlertStates = (alertStates = [], alerts = []) => {
  const keys = new Set((Array.isArray(alerts) ? alerts : []).map((alert) => alert?.alertKey))
  return stateCollection(alertStates).filter((state) => keys.has(state?.alertKey))
}

export const hasAlertState = (alertStates = [], alertKey) => stateCollection(alertStates).some((state) => state?.alertKey === alertKey)

export const isAlertStateRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !text(value.alertKey)) return false
  return typeof value.read === 'boolean' && typeof value.dismissed === 'boolean' && (value.snoozedUntil === null || value.snoozedUntil === undefined || validDate(value.snoozedUntil))
}

export const validateAlertStates = (alertStates = []) => {
  const errors = []
  const keys = new Set()
  stateCollection(alertStates).forEach((state, index) => {
    if (!isAlertStateRecord(state)) errors.push(`Estado de alerta inválido na posição ${index}.`)
    if (state?.alertKey && keys.has(state.alertKey)) errors.push(`Estado de alerta duplicado: ${state.alertKey}.`)
    if (state?.alertKey) keys.add(state.alertKey)
  })
  return { valid: errors.length === 0, errors }
}
