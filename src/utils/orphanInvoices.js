const hasHistory = (record) => Boolean(record.paidAt || record.paymentHistory?.length || record.reopenHistory?.length || record.audit?.length)
const hasCustomization = (record) => Boolean(record.customClosingDate || record.customDueDate || record.notes || record.adjustments?.length)
export const isOrphanInvoice = (record, transactions = [], cards = []) => {
  const purchases = transactions.filter((item) => item.invoiceId === record.id); const cardExists = cards.some((card) => card.id === record.cardId || record.id?.startsWith(`${card.id}-`))
  const historical = hasHistory(record); const customized = hasCustomization(record)
  const orphan = purchases.length === 0 || !cardExists
  return { orphan, disposable: orphan && purchases.length === 0 && !historical && !customized && !record.archived, archived: Boolean(record.archived), historical, customized, cardExists, purchaseCount: purchases.length, reason: !cardExists ? 'missing-card' : purchases.length === 0 ? 'empty-orphan-invoice' : null }
}
export const archiveInvoice = (record, reason, now = new Date().toISOString()) => ({ ...record, id: `archived:${record.id}:${now}`, originalInvoiceId: record.originalInvoiceId || record.id, archived: true, archivedAt: now, archiveReason: reason, audit: [...(record.audit || []).slice(-49), { eventId: `invoice-archived-${now}`, type: 'orphan_invoice_archived', createdAt: now, affectedIds: [record.id], reason }] })
export const restoreInvoice = (record, now = new Date().toISOString()) => ({ ...record, id: record.originalInvoiceId || record.id, originalInvoiceId: null, archived: false, restoredAt: now, audit: [...(record.audit || []).slice(-49), { eventId: `invoice-restored-${now}`, type: 'orphan_invoice_restored', createdAt: now, affectedIds: [record.originalInvoiceId || record.id] }] })
