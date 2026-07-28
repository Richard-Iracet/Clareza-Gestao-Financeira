const localDate = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const validTransfer = (transfer) => transfer
  && typeof transfer.transferId === 'string'
  && transfer.sourceAccountId
  && transfer.destinationAccountId
  && transfer.sourceAccountId !== transfer.destinationAccountId
  && Number.isFinite(Number(transfer.amount))
  && Number(transfer.amount) > 0

const afterBaseDate = (date, baseDate) => !baseDate || String(date || '') >= String(baseDate)
const originalEligible = (transfer, mode, cutoff) => {
  if (mode === 'history') return true
  if (mode === 'realized') return transfer.status === 'completed' && transfer.date <= cutoff
  if (mode === 'projected') return (transfer.status === 'scheduled') || (transfer.status === 'completed' && transfer.date > cutoff)
  return false
}
const reversalEligible = (transfer, mode, cutoff) => {
  if (!transfer.reversal) return false
  if (mode === 'history') return true
  if (mode === 'realized') return transfer.reversal.date <= cutoff
  if (mode === 'projected') return transfer.reversal.date > cutoff
  return false
}

const movement = (transfer, accountId, { reversal = false } = {}) => {
  const isSource = accountId === transfer.sourceAccountId
  const principal = Number(transfer.amount)
  const fee = Number(transfer.fee || 0)
  const direction = reversal ? (isSource ? 'in' : 'out') : (isSource ? 'out' : 'in')
  const amount = isSource ? principal + fee : principal
  const event = reversal ? transfer.reversal : transfer
  return {
    id: `${transfer.transferId}:${reversal ? 'reversal' : 'transfer'}:${isSource ? 'source' : 'destination'}`,
    transferId: transfer.transferId,
    reversalId: reversal ? event.reversalId : null,
    movementType: 'transfer',
    type: 'transfer',
    direction,
    signedAmount: direction === 'in' ? amount : -amount,
    amount,
    principalAmount: principal,
    fee: isSource ? fee : 0,
    date: event.date,
    status: reversal ? 'reversed' : transfer.status,
    originalStatus: transfer.status,
    description: reversal ? `Estorno de transfer\u00eancia${transfer.description ? `: ${transfer.description}` : ''}` : transfer.description,
    notes: reversal ? event.notes || '' : transfer.notes || '',
    sourceAccountId: transfer.sourceAccountId,
    destinationAccountId: transfer.destinationAccountId,
    counterpartyAccountId: isSource ? transfer.destinationAccountId : transfer.sourceAccountId,
    isReversal: reversal,
    affectsBalance: transfer.status === 'completed' || reversal,
  }
}

export const getTransferAccountMovements = (transfers = [], accountId, options = {}) => {
  const mode = options.mode || 'history'
  const cutoff = localDate(options.referenceDate)
  const baseDate = options.baseDate || ''
  return (Array.isArray(transfers) ? transfers : []).flatMap((transfer) => {
    if (!validTransfer(transfer) || (transfer.sourceAccountId !== accountId && transfer.destinationAccountId !== accountId)) return []
    const movements = []
    if (afterBaseDate(transfer.date, baseDate) && originalEligible(transfer, mode, cutoff)) movements.push(movement(transfer, accountId))
    if (transfer.reversal && afterBaseDate(transfer.reversal.date, baseDate) && reversalEligible(transfer, mode, cutoff)) movements.push(movement(transfer, accountId, { reversal: true }))
    return movements
  })
}

export const getTransferBalanceImpact = (transfers = [], accountId, options = {}) =>
  getTransferAccountMovements(transfers, accountId, options).reduce((total, item) => total + Number(item.signedAmount || 0), 0)

export const getTransferDisplayStatus = (transfer) => transfer?.reversal ? 'reversed' : transfer?.status || ''
