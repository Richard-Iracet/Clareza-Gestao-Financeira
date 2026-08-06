import { createBaselineReport } from '../baseline/baselineReport.js'
import { compareBaselineReports } from '../baseline/baselineComparison.js'

const clean = (value) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
const collection = (rows, normalized) => (rows || []).map((row) => ({ ...(row.legacy_payload || {}), ...clean(normalized(row)) }))
export const reconstructLegacyState = (entities = {}, retained = {}) => ({
  transactions: collection(entities.transactions, (row) => ({ id: row.id, type: row.type, description: row.description, amount: row.amount, date: row.transaction_date, dueDate: row.due_date, paidAt: row.paid_at, status: row.status, accountId: row.account_id, cardId: row.card_id, category: row.category_id, costCenter: row.cost_center_id, invoiceId: row.invoice_id, recurrenceId: row.recurrence_id, installmentGroupId: row.installment_group_id, installmentNumber: row.installment_number, installmentTotal: row.installment_total, ...(row.competence_key ? { competenceYear: Number(row.competence_key.slice(0, 4)), competenceMonth: Number(row.competence_key.slice(5, 7)) } : {}) })),
  accounts: collection(entities.accounts, (row) => ({ accountId: row.id, name: row.name, type: row.type, institution: row.institution, currency: row.currency, initialBalance: row.initial_balance, initialBalanceDate: row.initial_balance_date, includeInTotalBalance: row.include_in_total, archived: row.archived, archivedAt: row.archived_at, color: row.color, icon: row.icon, notes: row.notes })),
  cards: collection(entities.cards, (row) => ({ id: row.id, name: row.name, institution: row.institution, accountId: row.account_id, closingDay: row.closing_day, dueDay: row.due_day, archived: row.archived, limitAmount: row.limit_amount, billingConfigurations: row.billing_config })),
  invoiceRecords: collection(entities.invoiceRecords, (row) => ({ id: row.id, cardId: row.card_id, status: row.status, total: row.total_amount, paidAmount: row.paid_amount, pendingAmount: row.pending_amount, dueDate: row.due_date, paymentAccountId: row.payment_account_id, ...(row.competence_key ? { invoiceYear: Number(row.competence_key.slice(0, 4)), invoiceMonth: Number(row.competence_key.slice(5, 7)) } : {}) })),
  transfers: collection(entities.transfers, (row) => ({ transferId: row.id, sourceAccountId: row.source_account_id, destinationAccountId: row.destination_account_id, amount: row.amount, fee: row.fee_amount, date: row.scheduled_date, completedAt: row.completed_at, cancelledAt: row.cancelled_at, status: row.status === 'reversed' ? 'completed' : row.status, recurrenceId: row.recurrence_id })),
  recurrences: collection(entities.recurrences, (row) => ({ recurrenceId: row.id, type: row.type, description: row.description, amount: row.amount, frequency: row.frequency, interval: row.interval_count, startDate: row.start_date, endDate: row.end_date, nextOccurrenceDate: row.next_occurrence_date, status: row.status, accountId: row.account_id, cardId: row.card_id, sourceAccountId: row.source_account_id, destinationAccountId: row.destination_account_id })),
  categories: (entities.categories || []).map((row) => row.name),
  costCenters: (entities.costCenters || []).map((row) => row.name),
  alertStates: retained.alertStates || [], filters: retained.filters || {}, userSettings: retained.userSettings || {}, migrations: retained.migrations || {},
})

export const createRelationalEquivalenceReport = ({ legacyState, relationalEntities, source, referenceDate, generatedAt }) => {
  const options = { referenceDate, generatedAt, revision: source?.revision, snapshotId: source?.snapshotId, snapshotChecksum: source?.checksum }
  const legacyReport = createBaselineReport(legacyState, options)
  const relationalReport = createBaselineReport(reconstructLegacyState(relationalEntities, legacyState), options)
  const comparison = compareBaselineReports(legacyReport, relationalReport)
  const differences = comparison.differences || []
  return {
    runId: source?.runId || null, userId: source?.userId || null, sourceRevision: source?.revision || null,
    sourceChecksum: source?.checksum || null, generatedAt: generatedAt || new Date().toISOString(),
    status: comparison.equal ? 'equivalent' : 'divergent',
    summary: { comparedFields: comparison.comparedFields || 0, equalFields: comparison.equalFields || 0, divergentFields: differences.length, missingLegacy: 0, missingRelational: 0 },
    differences, legacyReportChecksum: legacyReport.reportChecksum, relationalReportChecksum: relationalReport.reportChecksum,
  }
}
