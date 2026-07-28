import { createInvoiceId, getInvoiceDates, getInvoicePeriod, shiftInvoicePeriod } from './invoiceCalculations.js'

export const applyTemporalAssignment = (transactions, transactionId, changes, card, options = {}) => {
  const target = transactions.find((item) => item.id === transactionId); if (!target) throw new Error('Lançamento não encontrado.')
  if (target.invoiceAssignmentMode === 'legacy-fixed' && options.mode === 'recalculate' && !options.confirmLegacy) return { requiresConfirmation: true, reason: 'legacy-fixed' }
  const scope = options.scope || 'single'; const affected = scope === 'future' && target.installmentGroupId ? transactions.filter((item) => item.installmentGroupId === target.installmentGroupId && Number(item.installmentNumber) >= Number(target.installmentNumber)) : [target]
  if (affected.some((item) => item.status === 'paid') && !options.confirmPaid) return { requiresConfirmation: true, reason: 'paid-installment', affected }
  const basePeriod = options.mode === 'recalculate' ? getInvoicePeriod(changes.date || target.date, card) : { invoiceMonth: Number(changes.invoiceMonth || target.invoiceMonth), invoiceYear: Number(changes.invoiceYear || target.invoiceYear) }
  const affectedIds = new Set(affected.map((item) => item.id)); const updated = transactions.map((item) => {
    if (!affectedIds.has(item.id)) return item
    const offset = scope === 'future' ? Number(item.installmentNumber) - Number(target.installmentNumber) : 0; const period = scope === 'future' ? shiftInvoicePeriod(basePeriod.invoiceYear, basePeriod.invoiceMonth, offset) : basePeriod
    if (options.mode === 'keep') return { ...item, ...changes, invoiceAssignmentMode: 'manual', dateAssignmentOverride: true, assignmentReason: 'date-changed-invoice-preserved' }
    const dates = getInvoiceDates(card, period.invoiceYear, period.invoiceMonth)
    return { ...item, ...changes, ...period, invoiceId: createInvoiceId(card.id, period.invoiceYear, period.invoiceMonth), dueDate: dates.dueDate, invoiceAssignmentMode: options.mode === 'manual' ? 'manual' : 'automatic', dateAssignmentOverride: scope === 'single', assignmentReason: options.mode === 'manual' ? 'competence-selected' : null }
  })
  return { success: true, transactions: updated, affectedIds: [...affectedIds] }
}
