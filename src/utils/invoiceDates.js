import { getInvoiceDates } from './invoiceCalculations.js'
export const INVOICE_DATE_MIGRATION_VERSION = 1
export const createOfficialInvoiceRecord = (transaction, card, existing = {}, source = 'card-default', now = new Date().toISOString()) => {
  const calculated = getInvoiceDates(card, transaction.invoiceYear, transaction.invoiceMonth)
  return { ...existing, id: transaction.invoiceId, invoiceId: transaction.invoiceId, cardId: transaction.cardId, invoiceMonth: Number(transaction.invoiceMonth), invoiceYear: Number(transaction.invoiceYear), closingDate: existing.closingDate || existing.customClosingDate || calculated.closingDate, dueDate: existing.dueDate || existing.customDueDate || transaction.dueDate || calculated.dueDate, dateSource: existing.dateSource || source, createdAt: existing.createdAt || now, updatedAt: now }
}
export const analyzeInvoiceDateRecords = (transactions = [], records = []) => {
  const byInvoice = new Map(); transactions.filter((item) => item.invoiceId).forEach((item) => { if (!byInvoice.has(item.invoiceId)) byInvoice.set(item.invoiceId, []); byInvoice.get(item.invoiceId).push(item) })
  const recordIds = new Set(records.map((item) => item.id)); const safe = []; const ambiguous = []
  byInvoice.forEach((items, invoiceId) => { if (recordIds.has(invoiceId)) return; const dueDates = [...new Set(items.map((item) => item.dueDate).filter(Boolean))]; if (dueDates.length === 1) safe.push({ invoiceId, items, dueDate: dueDates[0] }); else ambiguous.push({ invoiceId, dueDates }) })
  return { safe, ambiguous, missingOfficialRecords: [...byInvoice.keys()].filter((id) => !recordIds.has(id)).length }
}
export const migrateSafeInvoiceDates = (transactions, records, cards) => {
  const report = analyzeInvoiceDateRecords(transactions, records); const additions = report.safe.map(({ items }) => { const card = cards.find((value) => value.id === items[0].cardId); return card ? createOfficialInvoiceRecord(items[0], card, {}, 'historical') : null }).filter(Boolean)
  return { records: [...records, ...additions], report: { migrationVersion: INVOICE_DATE_MIGRATION_VERSION, recordsBefore: records.length, recordsAfter: records.length + additions.length, created: additions.map((item) => item.id), ambiguous: report.ambiguous } }
}
