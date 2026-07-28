export const evaluateInvoiceConsistency = (invoice, transactions = invoice?.transactions || []) => {
  const items = transactions.filter((item) => item.invoiceId === invoice.id || invoice.transactions?.includes(item))
  const paidTransactions = items.filter((item) => item.status === 'paid'); const pendingTransactions = items.filter((item) => item.status !== 'paid')
  const totalPaid = paidTransactions.reduce((sum, item) => sum + getTransactionAmount(item), 0); const totalPending = pendingTransactions.reduce((sum, item) => sum + getTransactionAmount(item), 0)
  const history = invoice.paymentHistory || []; const recordedPaid = history.reduce((sum, payment) => sum + Number(payment.amount || 0), 0); const issues = []
  if (invoice.status === 'paid' && pendingTransactions.length) issues.push('PAID_INVOICE_WITH_PENDING_TRANSACTIONS')
  if (invoice.status === 'paid' && !invoice.paidAt && history.length === 0) issues.push('PAID_INVOICE_WITHOUT_PAYMENT_HISTORY')
  if (invoice.status !== 'paid' && items.length > 0 && totalPending === 0) issues.push('ZERO_BALANCE_NOT_PAID')
  if (invoice.status === 'paid' && history.length && recordedPaid < Number(invoice.total || 0)) issues.push('PAID_TOTAL_BELOW_INVOICE_TOTAL')
  if (recordedPaid > Number(invoice.total || 0)) issues.push('PAYMENT_ABOVE_INVOICE_TOTAL')
  if (paidTransactions.length && !invoice.paidAt && history.length === 0) issues.push('PAID_TRANSACTION_WITHOUT_INVOICE_PAYMENT')
  if (invoice.reopenedAt && !(invoice.reopenHistory || []).length) issues.push('REOPENED_WITHOUT_HISTORY')
  return { consistent: issues.length === 0, issues, pendingTransactions, paidTransactions, totalPending, totalPaid, recordedPaid, recommendedAction: issues.includes('PAID_INVOICE_WITH_PENDING_TRANSACTIONS') ? 'reopen' : null }
}

export const reopenInvoiceRecord = (record, invoice, transactionId, now = new Date().toISOString()) => {
  const previousPaidAmount = invoice.totalPaid ?? invoice.transactions.filter((item) => item.status === 'paid').reduce((sum, item) => sum + getTransactionAmount(item), 0)
  const paymentHistory = record.paymentHistory?.length ? record.paymentHistory : record.paidAt ? [{ paidAt: record.paidAt, amount: previousPaidAmount, type: 'full-payment', statusBeforeReopen: 'paid' }] : []
  return { ...record, id: invoice.id, status: null, reopenedAt: now, paymentHistory, reopenHistory: [...(record.reopenHistory || []), { reopenedAt: now, reason: 'transaction-added-after-payment', transactionId, previousPaidAmount }], audit: [...(record.audit || []).slice(-49), { eventId: `invoice-reopened-${now}`, type: 'invoice_reopened', createdAt: now, affectedIds: [invoice.id, transactionId], reason: 'transaction-added-after-payment' }] }
}

export const appendInvoicePayment = (record, invoice, now = new Date().toISOString(), details = {}) => {
  const amount = invoice.totalPending ?? invoice.transactions.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + getTransactionAmount(item), 0)
  const payment = {
    paymentId: details.paymentId || details.operationId || `invoice-payment-${invoice.id}-${now}`,
    operationId: details.operationId || null,
    accountId: details.accountId || null,
    paymentDate: details.paymentDate || now.slice(0, 10),
    notes: details.notes ? String(details.notes).trim() : '',
    paidAt: now,
    amount,
    type: record.paymentHistory?.length ? 'balance-payment' : 'full-payment',
    statusBeforeReopen: record.status || invoice.status,
  }
  return {
    ...record,
    id: invoice.id,
    status: 'paid',
    paidAt: now,
    paymentHistory: [...(record.paymentHistory || []), payment],
    reopenedAt: null,
    audit: [...(record.audit || []).slice(-49), {
      eventId: details.operationId || `invoice-payment-${invoice.id}-${now}`,
      operationId: details.operationId || null,
      type: 'invoice_payment_recorded',
      createdAt: now,
      affectedIds: [invoice.id, payment.accountId].filter(Boolean),
    }],
  }
}
import { getTransactionAmount } from './installmentValueCalculations.js'
