import { advanceMonth, formatLocalISO, parseLocalDate } from '../../utils/dateCalculations.js'
import { isValidAccountDate } from '../accounts/accountService.js'

export const RECURRENCE_TYPES = ['income', 'expense', 'transfer']
export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly']
export const RECURRENCE_STATUSES = ['active', 'paused', 'completed', 'cancelled']
export const RECURRENCE_GENERATION_MODES = ['automatic', 'manual']
export const DEFAULT_ADVANCE_GENERATION_DAYS = 60
export const MAX_ADVANCE_GENERATION_DAYS = 365
export const DEFAULT_REMINDER_DAYS_BEFORE = 3
export const MAX_REMINDER_DAYS_BEFORE = 365
export const MAX_OCCURRENCES_PER_RUN = 366
const MAX_PAST_CURSOR_STEPS = 10000

const now = () => new Date().toISOString()
const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const finite = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
const positiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) >= 1
const nonNegativeInteger = (value) => Number.isInteger(Number(value)) && Number(value) >= 0
const validTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const text = (value) => String(value ?? '').trim()
const nullableIdentifier = (value) => {
  const normalized = text(value)
  return normalized || null
}
const compareDates = (left, right) => String(left || '').localeCompare(String(right || ''))

/** Returns a local YYYY-MM-DD string without depending on UTC parsing. */
export const toLocalDateString = (value = new Date()) => {
  if (typeof value === 'string' && isValidAccountDate(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatLocalISO(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export const isValidRecurrenceDate = (value) => isValidAccountDate(value)

export const addCalendarDays = (value, days = 0) => {
  const parsed = parseLocalDate(value)
  if (!parsed || !isValidAccountDate(value) || !Number.isInteger(Number(days))) return null
  const date = new Date(parsed.year, parsed.month - 1, parsed.day + Number(days))
  return formatLocalISO(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

const normalizedGenerationDays = (value) => value === '' || value === null || value === undefined
  ? DEFAULT_ADVANCE_GENERATION_DAYS
  : Number(value)
const normalizedReminderDays = (value) => value === '' || value === null || value === undefined
  ? DEFAULT_REMINDER_DAYS_BEFORE
  : Number(value)
const normalizedOccurrenceLimit = (value) => value === '' || value === null || value === undefined ? null : Number(value)
const normalizedCancelledOccurrenceKeys = (value) => Array.isArray(value)
  ? [...new Set(value.filter((item) => typeof item === 'string' && item))]
  : []

/**
 * Converts UI/legacy input into the canonical recurrence shape. It deliberately
 * retains no financial side effects: a recurrence is a rule, never an occurrence.
 */
export const normalizeRecurrenceInput = (input = {}, options = {}) => {
  const createdAt = options.createdAt || input.createdAt || now()
  const type = input.type || 'expense'
  const cardId = type === 'expense' ? nullableIdentifier(input.cardId) : null
  const startDate = input.startDate || ''
  const sourceAccountId = type === 'transfer' ? nullableIdentifier(input.sourceAccountId) : null
  const destinationAccountId = type === 'transfer' ? nullableIdentifier(input.destinationAccountId) : null
  return {
    recurrenceId: options.recurrenceId || input.recurrenceId || identifier(),
    type,
    frequency: input.frequency || 'monthly',
    interval: input.interval === '' || input.interval === null || input.interval === undefined ? 1 : Number(input.interval),
    startDate,
    endDate: input.endDate ? String(input.endDate) : null,
    occurrenceLimit: normalizedOccurrenceLimit(input.occurrenceLimit),
    nextOccurrenceDate: input.nextOccurrenceDate || startDate,
    amount: Number(input.amount),
    description: text(input.description),
    // Categories are strings in the current application. categoryId is accepted
    // only as an import/UI alias and is not persisted as a second model.
    category: text(input.category ?? input.categoryId),
    accountId: type === 'transfer' || cardId ? null : nullableIdentifier(input.accountId),
    paymentMethod: cardId ? 'Crédito' : text(input.paymentMethod),
    cardId,
    sourceAccountId,
    destinationAccountId,
    status: input.status || 'active',
    generationMode: input.generationMode || 'automatic',
    advanceGenerationDays: normalizedGenerationDays(input.advanceGenerationDays),
    reminderDaysBefore: normalizedReminderDays(input.reminderDaysBefore),
    cancelledOccurrenceKeys: normalizedCancelledOccurrenceKeys(input.cancelledOccurrenceKeys),
    createdAt,
    updatedAt: options.updatedAt || input.updatedAt || createdAt,
    notes: text(input.notes),
  }
}

const accountLookup = (accounts) => new Map((Array.isArray(accounts) ? accounts : []).map((account) => [account?.accountId, account]))
const cardLookup = (cards) => new Map((Array.isArray(cards) ? cards : []).map((card) => [card?.id, card]))

/** Validates a canonical recurrence without mutating it. */
export const validateRecurrenceRecord = (record = {}, options = {}) => {
  const errors = []
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { valid: false, errors: ['Recorrência com estrutura inválida.'] }
  if (typeof record.recurrenceId !== 'string' || !record.recurrenceId) errors.push('recurrenceId obrigatório.')
  if (!RECURRENCE_TYPES.includes(record.type)) errors.push('Tipo da recorrência inválido.')
  if (!RECURRENCE_FREQUENCIES.includes(record.frequency)) errors.push('Frequência da recorrência inválida.')
  if (!positiveInteger(record.interval)) errors.push('O intervalo deve ser um inteiro maior que zero.')
  if (!isValidRecurrenceDate(record.startDate)) errors.push('Data inicial inválida.')
  if (record.endDate !== null && record.endDate !== undefined && !isValidRecurrenceDate(record.endDate)) errors.push('Data final inválida.')
  if (isValidRecurrenceDate(record.startDate) && isValidRecurrenceDate(record.endDate) && compareDates(record.endDate, record.startDate) < 0) errors.push('A data final não pode ser anterior à inicial.')
  if (record.occurrenceLimit !== null && record.occurrenceLimit !== undefined && !positiveInteger(record.occurrenceLimit)) errors.push('O limite de ocorrências deve ser um inteiro maior que zero.')
  if (!isValidRecurrenceDate(record.nextOccurrenceDate)) errors.push('Próxima ocorrência inválida.')
  if (isValidRecurrenceDate(record.startDate) && isValidRecurrenceDate(record.nextOccurrenceDate) && compareDates(record.nextOccurrenceDate, record.startDate) < 0) errors.push('A próxima ocorrência não pode anteceder a data inicial.')
  if (!finite(record.amount) || Number(record.amount) <= 0) errors.push('O valor da recorrência deve ser maior que zero.')
  if (typeof record.description !== 'string' || !record.description.trim()) errors.push('Descrição obrigatória.')
  if (typeof record.category !== 'string') errors.push('Categoria inválida.')
  if (record.accountId !== null && record.accountId !== undefined && (typeof record.accountId !== 'string' || !record.accountId)) errors.push('Conta financeira inválida.')
  if (record.cardId !== null && record.cardId !== undefined && (typeof record.cardId !== 'string' || !record.cardId)) errors.push('Cartão inválido.')
  if (record.sourceAccountId !== null && record.sourceAccountId !== undefined && (typeof record.sourceAccountId !== 'string' || !record.sourceAccountId)) errors.push('Conta de origem inválida.')
  if (record.destinationAccountId !== null && record.destinationAccountId !== undefined && (typeof record.destinationAccountId !== 'string' || !record.destinationAccountId)) errors.push('Conta de destino inválida.')
  if (typeof record.paymentMethod !== 'string') errors.push('Forma de pagamento inválida.')
  if (!RECURRENCE_STATUSES.includes(record.status)) errors.push('Status da recorrência inválido.')
  if (!RECURRENCE_GENERATION_MODES.includes(record.generationMode)) errors.push('Modo de geração inválido.')
  if (!nonNegativeInteger(record.advanceGenerationDays) || Number(record.advanceGenerationDays) > MAX_ADVANCE_GENERATION_DAYS) errors.push(`A antecedência de geração deve estar entre 0 e ${MAX_ADVANCE_GENERATION_DAYS} dias.`)
  if (!nonNegativeInteger(record.reminderDaysBefore) || Number(record.reminderDaysBefore) > MAX_REMINDER_DAYS_BEFORE) errors.push(`O lembrete deve estar entre 0 e ${MAX_REMINDER_DAYS_BEFORE} dias.`)
  if (record.cancelledOccurrenceKeys !== undefined && (!Array.isArray(record.cancelledOccurrenceKeys) || record.cancelledOccurrenceKeys.some((key) => typeof key !== 'string' || !key))) errors.push('Cancelamentos individuais inválidos.')
  if (!validTimestamp(record.createdAt)) errors.push('createdAt inválido.')
  if (!validTimestamp(record.updatedAt)) errors.push('updatedAt inválido.')
  if (typeof record.notes !== 'string') errors.push('Observações inválidas.')

  if (record.type === 'transfer') {
    if (!record.sourceAccountId) errors.push('Conta de origem obrigatória para transferência recorrente.')
    if (!record.destinationAccountId) errors.push('Conta de destino obrigatória para transferência recorrente.')
    if (record.sourceAccountId && record.sourceAccountId === record.destinationAccountId) errors.push('As contas da transferência recorrente devem ser diferentes.')
    if (record.accountId) errors.push('Transferência recorrente não pode ter conta única.')
    if (record.cardId) errors.push('Transferência recorrente não pode usar cartão.')
  } else {
    if (record.sourceAccountId || record.destinationAccountId) errors.push('Somente transferências recorrentes podem ter origem e destino.')
    if (record.cardId && record.type !== 'expense') errors.push('Somente despesas recorrentes podem usar cartão.')
    if (record.cardId && record.paymentMethod !== 'Crédito') errors.push('Recorrência com cartão deve usar pagamento em crédito.')
  }

  const hasAccounts = own(options, 'accounts')
  const hasCards = own(options, 'cards')
  const allowArchived = options.allowArchived !== false
  const accounts = accountLookup(options.accounts)
  const cards = cardLookup(options.cards)
  const validateAccountReference = (accountId, label) => {
    if (!accountId || !hasAccounts) return
    const account = accounts.get(accountId)
    if (!account) errors.push(`${label} não existe.`)
    else if (!allowArchived && account.archived) errors.push(`${label} está arquivada.`)
  }
  validateAccountReference(record.accountId, 'Conta financeira')
  validateAccountReference(record.sourceAccountId, 'Conta de origem')
  validateAccountReference(record.destinationAccountId, 'Conta de destino')
  if (record.cardId && hasCards) {
    const card = cards.get(record.cardId)
    if (!card) errors.push('Cartão não existe.')
    else if (!allowArchived && card.archived) errors.push('Cartão está arquivado.')
  }

  return { valid: errors.length === 0, errors }
}

export const createRecurrence = (input = {}, options = {}) => {
  const recurrence = normalizeRecurrenceInput(input, options)
  const validation = validateRecurrenceRecord(recurrence, {
    ...(own(options, 'accounts') ? { accounts: options.accounts } : {}),
    ...(own(options, 'cards') ? { cards: options.cards } : {}),
    allowArchived: false,
  })
  if (!validation.valid) return { success: false, errorCode: 'INVALID_RECURRENCE', errors: validation.errors }
  const recurrences = Array.isArray(options.existingRecurrences) ? options.existingRecurrences : []
  if (recurrences.some((item) => item?.recurrenceId === recurrence.recurrenceId)) return { success: false, errorCode: 'DUPLICATE_RECURRENCE_ID', errors: ['Já existe uma recorrência com este identificador.'] }
  return { success: true, recurrence }
}

const copyDefined = (base, changes = {}) => Object.entries(changes).reduce((next, [key, value]) => {
  if (value !== undefined) next[key] = value
  return next
}, { ...base })

/**
 * Updates only the rule. Generated occurrences remain independent historical
 * records. Changing type/start date after generation is blocked because it could
 * create a second identity for the same financial commitment.
 */
export const updateRecurrence = (recurrence, changes = {}, options = {}) => {
  if (!recurrence) return { success: false, errorCode: 'RECURRENCE_NOT_FOUND', errors: ['Recorrência não encontrada.'] }
  const generatedCount = Number(options.generatedOccurrenceCount ?? getGeneratedOccurrenceCount(recurrence.recurrenceId, options))
  if (generatedCount > 0 && changes.type !== undefined && changes.type !== recurrence.type) return { success: false, errorCode: 'RECURRENCE_TYPE_LOCKED_AFTER_GENERATION', errors: ['O tipo não pode mudar após gerar ocorrências. Crie uma nova recorrência para a nova natureza financeira.'] }
  if (generatedCount > 0 && changes.startDate !== undefined && changes.startDate !== recurrence.startDate) return { success: false, errorCode: 'RECURRENCE_START_DATE_LOCKED_AFTER_GENERATION', errors: ['A data inicial não pode mudar após gerar ocorrências.'] }
  const protectedChanges = copyDefined({}, changes)
  delete protectedChanges.recurrenceId
  delete protectedChanges.createdAt
  delete protectedChanges.status
  const source = copyDefined(recurrence, protectedChanges)
  const candidate = normalizeRecurrenceInput(source, {
    recurrenceId: recurrence.recurrenceId,
    createdAt: recurrence.createdAt,
    updatedAt: options.updatedAt || now(),
  })
  candidate.status = recurrence.status
  if (changes.startDate !== undefined && changes.nextOccurrenceDate === undefined && compareDates(candidate.nextOccurrenceDate, candidate.startDate) < 0) candidate.nextOccurrenceDate = candidate.startDate
  const validation = validateRecurrenceRecord(candidate, {
    ...(own(options, 'accounts') ? { accounts: options.accounts } : {}),
    ...(own(options, 'cards') ? { cards: options.cards } : {}),
    allowArchived: options.allowArchived ?? candidate.status !== 'active',
  })
  if (!validation.valid) return { success: false, errorCode: 'INVALID_RECURRENCE', errors: validation.errors }
  return { success: true, recurrence: candidate, generatedOccurrenceCount: generatedCount }
}

const statusTransitions = {
  active: new Set(['paused', 'completed', 'cancelled']),
  paused: new Set(['active', 'completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
}

export const setRecurrenceStatus = (recurrence, status, options = {}) => {
  if (!recurrence) return { success: false, errorCode: 'RECURRENCE_NOT_FOUND' }
  if (!RECURRENCE_STATUSES.includes(status)) return { success: false, errorCode: 'INVALID_RECURRENCE_STATUS' }
  if (recurrence.status === status) return { success: true, unchanged: true, recurrence }
  if (!statusTransitions[recurrence.status]?.has(status)) return { success: false, errorCode: 'INVALID_RECURRENCE_STATUS_TRANSITION', errors: ['Esta transição de status não é permitida.'] }
  return { success: true, recurrence: { ...recurrence, status, updatedAt: options.updatedAt || now() } }
}

export const pauseRecurrence = (recurrence, options = {}) => setRecurrenceStatus(recurrence, 'paused', options)
export const resumeRecurrence = (recurrence, options = {}) => setRecurrenceStatus(recurrence, 'active', options)
export const completeRecurrence = (recurrence, options = {}) => setRecurrenceStatus(recurrence, 'completed', options)
export const cancelRecurrence = (recurrence, options = {}) => setRecurrenceStatus(recurrence, 'cancelled', options)

/** Stable occurrence identity, independent of generated transaction/transfer ids. */
export const getRecurrenceOccurrenceKey = (recurrenceId, scheduledOccurrenceDate, type) => {
  if (!recurrenceId || !isValidRecurrenceDate(scheduledOccurrenceDate) || !RECURRENCE_TYPES.includes(type)) return ''
  return `recurrence:${encodeURIComponent(String(recurrenceId))}:${type}:${scheduledOccurrenceDate}`
}

export const getRecurrenceOccurrenceOperationId = (recurrenceId, scheduledOccurrenceDate, type) => {
  const key = getRecurrenceOccurrenceKey(recurrenceId, scheduledOccurrenceDate, type)
  return key ? `operation:${key}` : ''
}

const recurrenceTypeOfRecord = (record = {}) => record.recurrenceType
  || (record.sourceAccountId && record.destinationAccountId ? 'transfer' : record.type)
const occurrenceDateOfRecord = (record = {}) => record.scheduledOccurrenceDate || record.date

export const getOccurrenceKeyFromRecord = (record = {}) => {
  if (typeof record.recurrenceOccurrenceId === 'string' && record.recurrenceOccurrenceId) return record.recurrenceOccurrenceId
  return getRecurrenceOccurrenceKey(record.recurrenceId, occurrenceDateOfRecord(record), recurrenceTypeOfRecord(record))
}

/** Builds non-mutating indexes used to make generation idempotent. */
export const buildRecurrenceIndexes = (input = {}, maybeTransfers = []) => {
  const state = Array.isArray(input) ? { transactions: input, transfers: maybeTransfers } : input || {}
  const transactions = Array.isArray(state.transactions) ? state.transactions : []
  const transfers = Array.isArray(state.transfers) ? state.transfers : []
  const recordsByKey = new Map()
  const recordsByRecurrenceId = new Map()
  const transactionsByRecurrenceId = new Map()
  const transfersByRecurrenceId = new Map()
  const duplicateKeys = new Set()
  const add = (record, kind) => {
    if (!record?.recurrenceId) return
    const key = getOccurrenceKeyFromRecord(record)
    const entry = { record, kind, key }
    const all = recordsByRecurrenceId.get(record.recurrenceId) || []
    all.push(entry)
    recordsByRecurrenceId.set(record.recurrenceId, all)
    const byKind = (kind === 'transaction' ? transactionsByRecurrenceId : transfersByRecurrenceId)
    const kindEntries = byKind.get(record.recurrenceId) || []
    kindEntries.push(entry)
    byKind.set(record.recurrenceId, kindEntries)
    if (!key) return
    const records = recordsByKey.get(key) || []
    if (records.length) duplicateKeys.add(key)
    records.push(entry)
    recordsByKey.set(key, records)
  }
  transactions.forEach((record) => add(record, 'transaction'))
  transfers.forEach((record) => add(record, 'transfer'))
  return {
    recordsByKey,
    occurrenceKeys: new Set(recordsByKey.keys()),
    recordsByRecurrenceId,
    transactionsByRecurrenceId,
    transfersByRecurrenceId,
    duplicateKeys: [...duplicateKeys],
  }
}

const indexesFromOptions = (options = {}) => options.indexes || buildRecurrenceIndexes({ transactions: options.transactions, transfers: options.transfers })

export const getRecurrenceOccurrences = (recurrenceId, options = {}) => indexesFromOptions(options).recordsByRecurrenceId.get(recurrenceId) || []

export const getGeneratedOccurrenceCount = (recurrenceId, options = {}) => {
  const entries = getRecurrenceOccurrences(recurrenceId, options)
  const uniqueKeys = new Set(entries.map((entry) => entry.key).filter(Boolean))
  return uniqueKeys.size || entries.length
}

export const hasRecurrenceOccurrence = (recurrenceId, scheduledOccurrenceDate, type, options = {}) =>
  indexesFromOptions(options).occurrenceKeys.has(getRecurrenceOccurrenceKey(recurrenceId, scheduledOccurrenceDate, type))

export const canDeleteRecurrence = (recurrenceId, options = {}) => {
  const occurrenceCount = getGeneratedOccurrenceCount(recurrenceId, options)
  return { canDelete: occurrenceCount === 0, occurrenceCount }
}

export const deleteRecurrence = (recurrences = [], recurrenceId, options = {}) => {
  const recurrence = (Array.isArray(recurrences) ? recurrences : []).find((item) => item?.recurrenceId === recurrenceId)
  if (!recurrence) return { success: false, errorCode: 'RECURRENCE_NOT_FOUND' }
  const deletion = canDeleteRecurrence(recurrenceId, options)
  if (!deletion.canDelete) return { success: false, errorCode: 'RECURRENCE_HAS_GENERATED_OCCURRENCES', ...deletion, errors: ['Recorrências com ocorrências geradas devem ser encerradas, não excluídas.'] }
  return { success: true, recurrences: recurrences.filter((item) => item?.recurrenceId !== recurrenceId) }
}

const validSchedule = (recurrence) => isValidRecurrenceDate(recurrence?.startDate)
  && RECURRENCE_FREQUENCIES.includes(recurrence?.frequency)
  && positiveInteger(recurrence?.interval)

/**
 * Advances one calendar occurrence. Monthly/yearly calculations use the original
 * start day, so Jan-31 -> Feb-28 -> Mar-31 and Feb-29 recovers on leap years.
 */
export const getNextOccurrenceDate = (recurrence, occurrenceDate) => {
  if (!validSchedule(recurrence) || !isValidRecurrenceDate(occurrenceDate)) return null
  const current = parseLocalDate(occurrenceDate)
  const anchor = parseLocalDate(recurrence.startDate)
  const interval = Number(recurrence.interval)
  if (recurrence.frequency === 'daily') return addCalendarDays(occurrenceDate, interval)
  if (recurrence.frequency === 'weekly') return addCalendarDays(occurrenceDate, interval * 7)
  if (recurrence.frequency === 'monthly') {
    const next = advanceMonth(current.year, current.month, interval)
    return formatLocalISO(next.year, next.month, anchor.day)
  }
  return formatLocalISO(current.year + interval, anchor.month, anchor.day)
}

export const getOccurrenceDateAtIndex = (recurrence, index) => {
  if (!validSchedule(recurrence) || !Number.isInteger(Number(index)) || Number(index) < 0) return null
  let date = recurrence.startDate
  for (let current = 0; current < Number(index); current += 1) {
    date = getNextOccurrenceDate(recurrence, date)
    if (!date) return null
  }
  return date
}

/** Returns the zero-based sequence ordinal or -1 for a date outside the schedule. */
export const getOccurrenceOrdinal = (recurrence, scheduledOccurrenceDate, maxSteps = 100000) => {
  if (!validSchedule(recurrence) || !isValidRecurrenceDate(scheduledOccurrenceDate)) return -1
  if (compareDates(scheduledOccurrenceDate, recurrence.startDate) < 0) return -1
  let date = recurrence.startDate
  for (let index = 0; index <= maxSteps; index += 1) {
    const comparison = compareDates(date, scheduledOccurrenceDate)
    if (comparison === 0) return index
    if (comparison > 0) return -1
    date = getNextOccurrenceDate(recurrence, date)
    if (!date) return -1
  }
  return -1
}

export const getRecurrenceWindowEndDate = (recurrence, referenceDate = new Date()) => {
  const reference = toLocalDateString(referenceDate)
  if (!reference || !validSchedule(recurrence)) return null
  return addCalendarDays(reference, Number(recurrence.advanceGenerationDays))
}

const occurrenceMetadata = (recurrence, scheduledOccurrenceDate) => {
  const recurrenceOccurrenceId = getRecurrenceOccurrenceKey(recurrence.recurrenceId, scheduledOccurrenceDate, recurrence.type)
  return {
    recurrenceId: recurrence.recurrenceId,
    recurrenceType: recurrence.type,
    recurrenceOccurrenceId,
    scheduledOccurrenceDate,
    generatedFromRecurrence: true,
    detachedFromRecurrence: false,
    recurrenceVersion: recurrence.updatedAt || recurrence.createdAt || null,
  }
}

export const buildTransactionOccurrenceSpec = (recurrence, scheduledOccurrenceDate) => {
  if (!['income', 'expense'].includes(recurrence?.type) || !isValidRecurrenceDate(scheduledOccurrenceDate)) return null
  const cardId = recurrence.cardId || null
  return {
    ...occurrenceMetadata(recurrence, scheduledOccurrenceDate),
    type: recurrence.type,
    description: recurrence.description,
    amount: Number(recurrence.amount),
    category: recurrence.category,
    accountId: cardId ? null : recurrence.accountId || null,
    accountAssignmentStatus: cardId ? 'not-applicable' : (recurrence.accountId ? 'assigned' : 'unassigned'),
    paymentMethod: cardId ? 'Crédito' : recurrence.paymentMethod,
    cardId,
    date: scheduledOccurrenceDate,
    dueDate: scheduledOccurrenceDate,
    // Every recurring card occurrence is intentionally a single installment.
    installmentNumber: 1,
    installmentTotal: 1,
    installment: '1/1',
    installmentAmount: Number(recurrence.amount),
    status: 'pending',
    notes: recurrence.notes,
    source: 'recurrence',
  }
}

export const buildTransferOccurrenceSpec = (recurrence, scheduledOccurrenceDate) => {
  if (recurrence?.type !== 'transfer' || !isValidRecurrenceDate(scheduledOccurrenceDate)) return null
  return {
    ...occurrenceMetadata(recurrence, scheduledOccurrenceDate),
    sourceAccountId: recurrence.sourceAccountId,
    destinationAccountId: recurrence.destinationAccountId,
    amount: Number(recurrence.amount),
    date: scheduledOccurrenceDate,
    status: 'scheduled',
    fee: 0,
    description: recurrence.description,
    notes: recurrence.notes,
    operationId: getRecurrenceOccurrenceOperationId(recurrence.recurrenceId, scheduledOccurrenceDate, recurrence.type),
  }
}

export const buildOccurrenceSpec = (recurrence, scheduledOccurrenceDate) => recurrence?.type === 'transfer'
  ? buildTransferOccurrenceSpec(recurrence, scheduledOccurrenceDate)
  : buildTransactionOccurrenceSpec(recurrence, scheduledOccurrenceDate)

const safeMaxOccurrences = (value) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return MAX_OCCURRENCES_PER_RUN
  return Math.min(parsed, MAX_OCCURRENCES_PER_RUN)
}

/**
 * Plans, but does not persist, forecast occurrences inside a bounded window.
 * The caller must atomically persist returned records and the advanced
 * recurrence cursor together.
 */
export const planRecurrenceOccurrences = (recurrence, options = {}) => {
  const validation = validateRecurrenceRecord(recurrence)
  if (!validation.valid) return { success: false, errorCode: 'INVALID_RECURRENCE', errors: validation.errors, occurrences: [] }
  if (recurrence.status !== 'active') return { success: true, skipped: true, reason: 'RECURRENCE_NOT_ACTIVE', occurrences: [], transactionOccurrences: [], transferOccurrences: [], nextOccurrenceDate: recurrence.nextOccurrenceDate, needsUpdate: false }
  if (recurrence.generationMode === 'manual' && !options.force) return { success: true, skipped: true, reason: 'MANUAL_GENERATION', occurrences: [], transactionOccurrences: [], transferOccurrences: [], nextOccurrenceDate: recurrence.nextOccurrenceDate, needsUpdate: false }

  const referenceDate = toLocalDateString(options.referenceDate || new Date())
  const requestedWindowEnd = options.untilDate ? toLocalDateString(options.untilDate) : getRecurrenceWindowEndDate(recurrence, referenceDate)
  if (!referenceDate || !requestedWindowEnd) return { success: false, errorCode: 'INVALID_GENERATION_WINDOW', errors: ['Janela de geração inválida.'], occurrences: [] }
  const windowEndDate = recurrence.endDate && compareDates(recurrence.endDate, requestedWindowEnd) < 0 ? recurrence.endDate : requestedWindowEnd
  const indexes = indexesFromOptions(options)
  const maxOccurrences = safeMaxOccurrences(options.maxOccurrences)
  let cursor = recurrence.nextOccurrenceDate || recurrence.startDate
  let ordinal = getOccurrenceOrdinal(recurrence, cursor)
  if (ordinal < 0) return { success: false, errorCode: 'INVALID_RECURRENCE_CURSOR', errors: ['A próxima ocorrência não pertence ao calendário da recorrência.'], occurrences: [] }

  const occurrences = []
  const skippedExisting = []
  const skippedPast = []
  const skippedCancelled = []
  const cancelledOccurrenceKeys = new Set(recurrence.cancelledOccurrenceKeys || [])
  let processedCount = 0
  let completed = false
  let completionReason = null
  let truncated = false
  let lastProcessedOccurrenceDate = null

  // Forecasts are generated from the current financial date onward. We advance
  // an old cursor without materialising a large, artificial history of pending
  // transactions. Existing past occurrences remain untouched and can still be
  // diagnosed or confirmed normally.
  const generationStartDate = options.includePastDue === true
    ? null
    : (options.fromDate ? toLocalDateString(options.fromDate) : referenceDate)
  let pastCursorSteps = 0
  while (cursor && generationStartDate && compareDates(cursor, generationStartDate) < 0) {
    if (recurrence.occurrenceLimit !== null && recurrence.occurrenceLimit !== undefined && ordinal >= Number(recurrence.occurrenceLimit)) {
      completed = true
      completionReason = 'occurrence-limit'
      break
    }
    if (recurrence.endDate && compareDates(cursor, recurrence.endDate) > 0) {
      completed = true
      completionReason = 'end-date'
      break
    }
    skippedPast.push({ scheduledOccurrenceDate: cursor })
    lastProcessedOccurrenceDate = cursor
    cursor = getNextOccurrenceDate(recurrence, cursor)
    ordinal += 1
    pastCursorSteps += 1
    if (pastCursorSteps >= MAX_PAST_CURSOR_STEPS) return {
      success: false,
      errorCode: 'RECURRENCE_CURSOR_TOO_OLD',
      errors: ['A recorrência possui uma data inicial muito antiga. Ajuste a data de início ou a próxima ocorrência antes de gerar.'],
      occurrences: [],
    }
  }
  while (cursor) {
    if (recurrence.occurrenceLimit !== null && recurrence.occurrenceLimit !== undefined && ordinal >= Number(recurrence.occurrenceLimit)) {
      completed = true
      completionReason = 'occurrence-limit'
      break
    }
    if (recurrence.endDate && compareDates(cursor, recurrence.endDate) > 0) {
      completed = true
      completionReason = 'end-date'
      break
    }
    if (compareDates(cursor, windowEndDate) > 0) break
    const key = getRecurrenceOccurrenceKey(recurrence.recurrenceId, cursor, recurrence.type)
    if (indexes.occurrenceKeys.has(key)) skippedExisting.push({ recurrenceOccurrenceId: key, scheduledOccurrenceDate: cursor })
    else if (cancelledOccurrenceKeys.has(key)) skippedCancelled.push({ recurrenceOccurrenceId: key, scheduledOccurrenceDate: cursor })
    else {
      const occurrence = buildOccurrenceSpec(recurrence, cursor)
      if (occurrence) occurrences.push(occurrence)
    }
    processedCount += 1
    lastProcessedOccurrenceDate = cursor
    cursor = getNextOccurrenceDate(recurrence, cursor)
    ordinal += 1
    if (processedCount >= maxOccurrences) {
      truncated = Boolean(cursor && compareDates(cursor, windowEndDate) <= 0)
      break
    }
  }
  if (!completed && recurrence.occurrenceLimit !== null && recurrence.occurrenceLimit !== undefined && ordinal >= Number(recurrence.occurrenceLimit)) {
    completed = true
    completionReason = 'occurrence-limit'
  }
  if (!completed && recurrence.endDate && cursor && compareDates(cursor, recurrence.endDate) > 0) {
    completed = true
    completionReason = 'end-date'
  }
  const transactionOccurrences = occurrences.filter((occurrence) => occurrence.recurrenceType !== 'transfer')
  const transferOccurrences = occurrences.filter((occurrence) => occurrence.recurrenceType === 'transfer')
  const nextOccurrenceDate = processedCount || skippedPast.length ? cursor : recurrence.nextOccurrenceDate
  return {
    success: true,
    recurrenceId: recurrence.recurrenceId,
    referenceDate,
    windowEndDate,
    occurrences,
    transactionOccurrences,
    transferOccurrences,
    skippedExisting,
    skippedPast,
    skippedCancelled,
    processedCount,
    lastProcessedOccurrenceDate,
    nextOccurrenceDate,
    completed,
    completionReason,
    truncated,
    needsUpdate: nextOccurrenceDate !== recurrence.nextOccurrenceDate || completed,
  }
}

/** Applies only the cursor/status portion after the caller persists a plan. */
export const advanceRecurrenceAfterGeneration = (recurrence, plan, options = {}) => {
  if (!recurrence) return { success: false, errorCode: 'RECURRENCE_NOT_FOUND' }
  if (!plan?.success) return { success: false, errorCode: 'INVALID_RECURRENCE_PLAN' }
  if (!plan.needsUpdate) return { success: true, unchanged: true, recurrence }
  return {
    success: true,
    recurrence: {
      ...recurrence,
      nextOccurrenceDate: plan.nextOccurrenceDate || recurrence.nextOccurrenceDate,
      status: plan.completed ? 'completed' : recurrence.status,
      updatedAt: options.updatedAt || now(),
    },
  }
}

export const applyRecurrenceGenerationPlan = advanceRecurrenceAfterGeneration

export const isGeneratedRecurrenceOccurrence = (record = {}) => Boolean(record.recurrenceId && getOccurrenceKeyFromRecord(record))

/** Keeps the recurrence reference while explicitly making a single occurrence independent. */
export const detachRecurrenceOccurrence = (record, options = {}) => {
  if (!record || !isGeneratedRecurrenceOccurrence(record)) return { success: false, errorCode: 'RECURRENCE_OCCURRENCE_NOT_FOUND' }
  return {
    success: true,
    occurrence: {
      ...record,
      detachedFromRecurrence: true,
      recurrenceDetachedAt: options.updatedAt || now(),
    },
  }
}

export const getRecurrenceOccurrenceScope = (recurrenceId, scheduledOccurrenceDate, scope = 'single', options = {}) => {
  const records = getRecurrenceOccurrences(recurrenceId, options)
  if (scope === 'all') return records
  if (!isValidRecurrenceDate(scheduledOccurrenceDate)) return []
  return records.filter((entry) => scope === 'future'
    ? compareDates(occurrenceDateOfRecord(entry.record), scheduledOccurrenceDate) >= 0
    : occurrenceDateOfRecord(entry.record) === scheduledOccurrenceDate)
}
