import { isValidAccountDate } from '../accounts/accountService.js'

export const TRANSFER_STATUSES = ['scheduled', 'completed', 'cancelled']

const now = () => new Date().toISOString()
const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const finite = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
const validTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const accountById = (accounts, accountId) => accounts.find((account) => account.accountId === accountId)
const auditEntry = (type, operationId, createdAt) => ({ eventId: identifier(), operationId: operationId || null, type, createdAt })
const appendAudit = (transfer, type, operationId, createdAt) => [
  ...(transfer.audit || []).slice(-49),
  auditEntry(type, operationId, createdAt),
]

export const TRANSFER_RECURRENCE_FIELDS = ['recurrenceId', 'recurrenceType', 'recurrenceOccurrenceId', 'scheduledOccurrenceDate', 'generatedFromRecurrence', 'detachedFromRecurrence', 'recurrenceVersion']

const recurrenceMetadata = (record = {}) => Object.fromEntries(
  TRANSFER_RECURRENCE_FIELDS
    .filter((field) => record[field] !== undefined)
    .map((field) => [field, record[field]]),
)

export const validateTransferRecurrenceMetadata = (transfer = {}) => {
  const errors = []
  const hasReference = TRANSFER_RECURRENCE_FIELDS.some((field) => transfer[field] !== undefined)
  if (!hasReference) return errors
  if (typeof transfer.recurrenceId !== 'string' || !transfer.recurrenceId) errors.push('recurrenceId obrigat\u00f3rio para uma transfer\u00eancia recorrente.')
  if (transfer.recurrenceType !== undefined && transfer.recurrenceType !== 'transfer') errors.push('recurrenceType inv\u00e1lido para transfer\u00eancia recorrente.')
  if (typeof transfer.recurrenceOccurrenceId !== 'string' || !transfer.recurrenceOccurrenceId) errors.push('recurrenceOccurrenceId obrigat\u00f3rio para uma transfer\u00eancia recorrente.')
  if (!isValidAccountDate(transfer.scheduledOccurrenceDate)) errors.push('Data da ocorr\u00eancia recorrente inv\u00e1lida.')
  if (transfer.generatedFromRecurrence !== true) errors.push('A transfer\u00eancia recorrente precisa indicar generatedFromRecurrence.')
  if (transfer.detachedFromRecurrence !== undefined && typeof transfer.detachedFromRecurrence !== 'boolean') errors.push('Flag detachedFromRecurrence inv\u00e1lida.')
  if (transfer.recurrenceVersion !== undefined && !(typeof transfer.recurrenceVersion === 'string' && !Number.isNaN(Date.parse(transfer.recurrenceVersion))) && (!Number.isInteger(Number(transfer.recurrenceVersion)) || Number(transfer.recurrenceVersion) < 1)) errors.push('recurrenceVersion inv\u00e1lida.')
  return errors
}

export const getTransferOperationIds = (transfer = {}) => {
  const record = transfer && typeof transfer === 'object' ? transfer : {}
  const audit = Array.isArray(record.audit) ? record.audit : []
  return [...new Set([
  record.operationId,
  ...audit.map((entry) => entry?.operationId),
  record.reversal?.operationId,
].filter((value) => typeof value === 'string' && value))]
}

const accountErrors = (candidate, accounts, { allowArchived = true } = {}) => {
  const errors = []
  const source = accountById(accounts, candidate.sourceAccountId)
  const destination = accountById(accounts, candidate.destinationAccountId)
  if (typeof candidate.sourceAccountId !== 'string' || !candidate.sourceAccountId) errors.push('Conta de origem obrigat\u00f3ria.')
  else if (!source) errors.push('A conta de origem n\u00e3o existe.')
  else if (!allowArchived && source.archived) errors.push('A conta de origem est\u00e1 arquivada.')
  if (typeof candidate.destinationAccountId !== 'string' || !candidate.destinationAccountId) errors.push('Conta de destino obrigat\u00f3ria.')
  else if (!destination) errors.push('A conta de destino n\u00e3o existe.')
  else if (!allowArchived && destination.archived) errors.push('A conta de destino est\u00e1 arquivada.')
  if (candidate.sourceAccountId && candidate.sourceAccountId === candidate.destinationAccountId) errors.push('A conta de origem deve ser diferente da conta de destino.')
  return errors
}

const reversalErrors = (transfer) => {
  const reversal = transfer.reversal
  if (reversal === undefined || reversal === null) return []
  const errors = []
  if (!reversal || typeof reversal !== 'object' || Array.isArray(reversal)) return ['Estorno inv\u00e1lido.']
  if (transfer.status !== 'completed') errors.push('Somente transfer\u00eancias conclu\u00eddas podem ter estorno.')
  if (typeof reversal.reversalId !== 'string' || !reversal.reversalId) errors.push('Estorno sem identifica\u00e7\u00e3o.')
  if (typeof reversal.operationId !== 'string' || !reversal.operationId) errors.push('Estorno sem operationId.')
  if (!isValidAccountDate(reversal.date)) errors.push('Data do estorno inv\u00e1lida.')
  if (!validTimestamp(reversal.createdAt)) errors.push('Data t\u00e9cnica do estorno inv\u00e1lida.')
  if (reversal.notes !== undefined && typeof reversal.notes !== 'string') errors.push('Observa\u00e7\u00e3o do estorno inv\u00e1lida.')
  if (isValidAccountDate(reversal.date) && isValidAccountDate(transfer.date) && reversal.date < transfer.date) errors.push('O estorno n\u00e3o pode anteceder a transfer\u00eancia.')
  if (reversal.operationId && reversal.operationId === transfer.operationId) errors.push('O estorno precisa de uma operationId pr\u00f3pria.')
  return errors
}

export const validateTransferRecord = (transfer = {}, { accounts = [], allowArchived = true } = {}) => {
  const errors = []
  if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer)) return { valid: false, errors: ['Transfer\u00eancia com estrutura inv\u00e1lida.'] }
  if (typeof transfer.transferId !== 'string' || !transfer.transferId) errors.push('transferId obrigat\u00f3rio.')
  errors.push(...accountErrors(transfer, Array.isArray(accounts) ? accounts : [], { allowArchived }))
  if (!finite(transfer.amount) || Number(transfer.amount) <= 0) errors.push('O valor da transfer\u00eancia deve ser maior que zero.')
  if (!isValidAccountDate(transfer.date)) errors.push('Data da transfer\u00eancia inv\u00e1lida.')
  if (!TRANSFER_STATUSES.includes(transfer.status)) errors.push('Status da transfer\u00eancia inv\u00e1lido.')
  if (transfer.fee !== undefined && (!finite(transfer.fee) || Number(transfer.fee) < 0)) errors.push('Taxa da transfer\u00eancia inv\u00e1lida.')
  if (Number(transfer.fee || 0) !== 0) errors.push('Taxas diferentes de zero ainda n\u00e3o s\u00e3o suportadas com seguran\u00e7a.')
  if (transfer.description !== undefined && typeof transfer.description !== 'string') errors.push('Descri\u00e7\u00e3o da transfer\u00eancia inv\u00e1lida.')
  if (transfer.notes !== undefined && typeof transfer.notes !== 'string') errors.push('Observa\u00e7\u00e3o da transfer\u00eancia inv\u00e1lida.')
  if (typeof transfer.operationId !== 'string' || !transfer.operationId) errors.push('operationId obrigat\u00f3rio.')
  if (!validTimestamp(transfer.createdAt)) errors.push('createdAt inv\u00e1lido.')
  if (!validTimestamp(transfer.updatedAt)) errors.push('updatedAt inv\u00e1lido.')
  if (transfer.audit !== undefined && !Array.isArray(transfer.audit)) errors.push('Auditoria da transfer\u00eancia inv\u00e1lida.')
  if (Array.isArray(transfer.audit) && transfer.audit.some((entry) => !entry || typeof entry !== 'object' || (entry.operationId !== null && entry.operationId !== undefined && typeof entry.operationId !== 'string') || (entry.createdAt && !validTimestamp(entry.createdAt)))) errors.push('Entrada de auditoria da transfer\u00eancia inv\u00e1lida.')
  errors.push(...validateTransferRecurrenceMetadata(transfer))
  errors.push(...reversalErrors(transfer))
  return { valid: errors.length === 0, errors }
}

const duplicateOperation = (transfers, operationId, ignoredTransferId = null) => transfers.some((transfer) =>
  transfer.transferId !== ignoredTransferId && getTransferOperationIds(transfer).includes(operationId))

export const createTransfer = (input = {}, options = {}) => {
  const createdAt = options.createdAt || now()
  const transfer = {
    transferId: options.transferId || input.transferId || identifier(),
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    amount: Number(input.amount),
    date: input.date,
    status: input.status || 'completed',
    fee: input.fee === undefined || input.fee === '' ? 0 : Number(input.fee),
    description: String(input.description || '').trim(),
    notes: String(input.notes || '').trim(),
    operationId: options.operationId || input.operationId || identifier(),
    createdAt,
    updatedAt: options.updatedAt || createdAt,
    reversal: null,
    ...recurrenceMetadata(input),
  }
  const validation = validateTransferRecord(transfer, { accounts: options.accounts || [], allowArchived: false })
  if (!validation.valid) return { success: false, errorCode: 'INVALID_TRANSFER', errors: validation.errors }
  const transfers = Array.isArray(options.existingTransfers) ? options.existingTransfers : []
  if (transfers.some((item) => item.transferId === transfer.transferId)) return { success: false, errorCode: 'DUPLICATE_TRANSFER_ID', errors: ['J\u00e1 existe uma transfer\u00eancia com este identificador.'] }
  if (duplicateOperation(transfers, transfer.operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
  return { success: true, transfer: { ...transfer, audit: [auditEntry('transfer_created', transfer.operationId, createdAt)] } }
}

const updateScheduled = (transfer, changes, options, eventType, nextStatus = 'scheduled') => {
  if (!transfer) return { success: false, errorCode: 'TRANSFER_NOT_FOUND', errors: ['Transfer\u00eancia n\u00e3o encontrada.'] }
  if (transfer.status !== 'scheduled') return { success: false, errorCode: 'TRANSFER_NOT_SCHEDULED', errors: ['Somente transfer\u00eancias agendadas podem ser alteradas.'] }
  const operationId = options.operationId || identifier()
  const transfers = Array.isArray(options.existingTransfers) ? options.existingTransfers : []
  if (duplicateOperation(transfers, operationId, transfer.transferId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
  const updatedAt = options.updatedAt || now()
  // Identity and scheduled date belong to the generated occurrence. A manual
  // edit may detach it, but must never relink it to another recurrence.
  const immutableRecurrenceMetadata = transfer.recurrenceId ? {
    recurrenceId: transfer.recurrenceId,
    recurrenceType: transfer.recurrenceType,
    recurrenceOccurrenceId: transfer.recurrenceOccurrenceId,
    scheduledOccurrenceDate: transfer.scheduledOccurrenceDate,
    generatedFromRecurrence: transfer.generatedFromRecurrence,
    recurrenceVersion: transfer.recurrenceVersion,
  } : {}
  const candidate = {
    ...transfer,
    ...changes,
    ...immutableRecurrenceMetadata,
    transferId: transfer.transferId,
    status: nextStatus,
    operationId: transfer.operationId,
    createdAt: transfer.createdAt,
    updatedAt,
    amount: changes.amount === undefined ? Number(transfer.amount) : Number(changes.amount),
    fee: changes.fee === undefined || changes.fee === '' ? Number(transfer.fee || 0) : Number(changes.fee),
    description: changes.description === undefined ? transfer.description : String(changes.description || '').trim(),
    notes: changes.notes === undefined ? transfer.notes : String(changes.notes || '').trim(),
    reversal: transfer.reversal || null,
  }
  const validation = validateTransferRecord(candidate, { accounts: options.accounts || [], allowArchived: nextStatus === 'cancelled' })
  if (!validation.valid) return { success: false, errorCode: 'INVALID_TRANSFER', errors: validation.errors }
  return { success: true, operationId, transfer: { ...candidate, audit: appendAudit(transfer, eventType, operationId, updatedAt) } }
}

export const updateScheduledTransfer = (transfer, changes = {}, options = {}) => updateScheduled(transfer, changes, options, 'transfer_updated', 'scheduled')

export const completeScheduledTransfer = (transfer, options = {}) => updateScheduled(transfer, {}, options, 'transfer_completed', 'completed')

export const cancelScheduledTransfer = (transfer, options = {}) => updateScheduled(transfer, {}, options, 'transfer_cancelled', 'cancelled')

export const reverseCompletedTransfer = (transfer, input = {}, options = {}) => {
  if (!transfer) return { success: false, errorCode: 'TRANSFER_NOT_FOUND', errors: ['Transfer\u00eancia n\u00e3o encontrada.'] }
  if (transfer.status !== 'completed') return { success: false, errorCode: 'TRANSFER_NOT_COMPLETED', errors: ['Somente transfer\u00eancias conclu\u00eddas podem ser estornadas.'] }
  if (transfer.reversal) return { success: false, errorCode: 'TRANSFER_ALREADY_REVERSED', errors: ['Esta transfer\u00eancia j\u00e1 possui um estorno.'] }
  const operationId = options.operationId || identifier()
  const transfers = Array.isArray(options.existingTransfers) ? options.existingTransfers : []
  if (duplicateOperation(transfers, operationId, transfer.transferId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
  const createdAt = options.createdAt || now()
  const candidate = {
    ...transfer,
    updatedAt: options.updatedAt || createdAt,
    reversal: {
      reversalId: options.reversalId || identifier(),
      operationId,
      date: input.date,
      notes: String(input.notes || '').trim(),
      createdAt,
    },
  }
  const validation = validateTransferRecord(candidate, { accounts: options.accounts || [], allowArchived: true })
  if (!validation.valid) return { success: false, errorCode: 'INVALID_REVERSAL', errors: validation.errors }
  return { success: true, operationId, transfer: { ...candidate, audit: appendAudit(transfer, 'transfer_reversed', operationId, candidate.updatedAt) } }
}

export const isTransferOperationKnown = (transfers = [], operationId) => Boolean(operationId) && transfers.some((transfer) => getTransferOperationIds(transfer).includes(operationId))
