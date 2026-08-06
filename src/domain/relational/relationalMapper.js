export const RELATIONAL_MAPPER_VERSION = 1

const list = (value) => Array.isArray(value) ? value : []
const text = (value) => value === null || value === undefined || value === '' ? null : String(value)
const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : null
const bool = (value) => typeof value === 'boolean' ? value : null
const civilDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null
const timestamp = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null
const competence = (item) => {
  if (/^\d{4}-\d{2}$/.test(String(item.competenceKey || ''))) return item.competenceKey
  const month = integer(item.competenceMonth ?? item.invoiceMonth), year = integer(item.competenceYear ?? item.invoiceYear)
  return month >= 1 && month <= 12 && year ? `${year}-${String(month).padStart(2, '0')}` : null
}
const identity = (value, prefix, index) => text(value) || `missing:${prefix}:${index}`
const common = (source, context) => ({
  user_id: context.userId, legacy_payload: source, source_state_revision: context.revision,
  source_snapshot_id: context.snapshotId, source_checksum: context.checksum,
  created_at: timestamp(source?.createdAt), updated_at: timestamp(source?.updatedAt),
})
const stringEntity = (value, prefix, index, context) => {
  const source = typeof value === 'string' ? { name: value } : value || {}
  const name = text(source.name ?? source.id ?? value) || `Sem nome ${index + 1}`
  return { ...common(source, context), id: identity(source.id ?? name, prefix, index), name }
}

export const mapFinanceStateToRelational = ({ userId, snapshot }) => {
  if (!userId || !snapshot?.data || !Number.isInteger(Number(snapshot.revision)) || !snapshot.checksum) throw new TypeError('Usuário e snapshot válido são obrigatórios.')
  const state = snapshot.data
  const context = { userId, revision: Number(snapshot.revision), snapshotId: text(snapshot.snapshotId), checksum: String(snapshot.checksum) }
  const issues = []
  const duplicateSafe = (items, entityType) => {
    const seen = new Set()
    return items.filter((item) => {
      const key = item.id
      if (!key || seen.has(key)) { issues.push({ entity_type: entityType, legacy_id: key, issue_code: 'DUPLICATE_OR_MISSING_ID', severity: 'error', details: {} }); return false }
      seen.add(key); return true
    })
  }

  const accounts = duplicateSafe(list(state.accounts).map((item, index) => ({
    ...common(item, context), id: identity(item?.accountId, 'account', index), name: text(item?.name), type: text(item?.type),
    institution: text(item?.institution), currency: text(item?.currency), initial_balance: number(item?.initialBalance),
    initial_balance_date: civilDate(item?.initialBalanceDate), include_in_total: bool(item?.includeInTotalBalance),
    archived: bool(item?.archived), archived_at: timestamp(item?.archivedAt), color: text(item?.color), icon: text(item?.icon), notes: text(item?.notes),
  })), 'account')
  const accountIds = new Set(accounts.map((item) => item.id))
  const ref = (value, ids, entityType, legacyId, field) => {
    const id = text(value); if (!id) return null
    if (!ids.has(id)) { issues.push({ entity_type: entityType, legacy_id: legacyId, issue_code: 'MISSING_REFERENCE', severity: 'warning', details: { field, referencedId: id } }); return null }
    return id
  }
  const cards = duplicateSafe(list(state.cards).map((item, index) => ({
    ...common(item, context), id: identity(item?.id, 'card', index), name: text(item?.name), institution: text(item?.institution),
    account_id: ref(item?.accountId, accountIds, 'card', item?.id, 'accountId'), closing_day: integer(item?.closingDay), due_day: integer(item?.dueDay),
    archived: bool(item?.archived), limit_amount: number(item?.limit ?? item?.limitAmount), billing_config: item?.billingConfigurations || null,
  })), 'card')
  const cardIds = new Set(cards.map((item) => item.id))
  const categories = duplicateSafe(list(state.categories).map((item, index) => stringEntity(item, 'category', index, context)), 'category')
  const categoryIds = new Set(categories.map((item) => item.id))
  const costCenters = duplicateSafe(list(state.costCenters).map((item, index) => stringEntity(item, 'cost-center', index, context)), 'cost_center')
  const costCenterIds = new Set(costCenters.map((item) => item.id))
  const recurrences = duplicateSafe(list(state.recurrences).map((item, index) => ({
    ...common(item, context), id: identity(item?.recurrenceId, 'recurrence', index), type: text(item?.type), description: text(item?.description), amount: number(item?.amount),
    frequency: text(item?.frequency), interval_count: integer(item?.interval), start_date: civilDate(item?.startDate), end_date: civilDate(item?.endDate),
    next_occurrence_date: civilDate(item?.nextOccurrenceDate), status: text(item?.status),
    account_id: ref(item?.accountId, accountIds, 'recurrence', item?.recurrenceId, 'accountId'), card_id: ref(item?.cardId, cardIds, 'recurrence', item?.recurrenceId, 'cardId'),
    source_account_id: ref(item?.sourceAccountId, accountIds, 'recurrence', item?.recurrenceId, 'sourceAccountId'), destination_account_id: ref(item?.destinationAccountId, accountIds, 'recurrence', item?.recurrenceId, 'destinationAccountId'),
  })), 'recurrence')
  const recurrenceIds = new Set(recurrences.map((item) => item.id))
  const invoiceRecords = duplicateSafe(list(state.invoiceRecords).map((item, index) => ({
    ...common(item, context), id: identity(item?.id ?? item?.invoiceId, 'invoice', index), card_id: ref(item?.cardId, cardIds, 'invoice_record', item?.id ?? item?.invoiceId, 'cardId'),
    competence_key: competence(item || {}), status: text(item?.status), total_amount: number(item?.total ?? item?.totalAmount), paid_amount: number(item?.paidAmount),
    pending_amount: number(item?.pendingAmount ?? item?.totalPending), due_date: civilDate(item?.dueDate),
    payment_account_id: ref(item?.paymentAccountId ?? item?.accountId, accountIds, 'invoice_record', item?.id ?? item?.invoiceId, 'paymentAccountId'),
  })), 'invoice_record')
  const invoiceIds = new Set(invoiceRecords.map((item) => item.id))
  const transactions = duplicateSafe(list(state.transactions).map((item, index) => ({
    ...common(item, context), id: identity(item?.id, 'transaction', index), type: text(item?.type), description: text(item?.description), amount: number(item?.amount),
    transaction_date: civilDate(item?.date), competence_key: competence(item || {}), due_date: civilDate(item?.dueDate), paid_at: timestamp(item?.paidAt), status: text(item?.status),
    account_id: ref(item?.accountId, accountIds, 'transaction', item?.id, 'accountId'), card_id: ref(item?.cardId, cardIds, 'transaction', item?.id, 'cardId'),
    category_id: ref(item?.categoryId ?? item?.category, categoryIds, 'transaction', item?.id, 'category'), cost_center_id: ref(item?.costCenterId ?? item?.costCenter, costCenterIds, 'transaction', item?.id, 'costCenter'),
    invoice_id: ref(item?.invoiceId, invoiceIds, 'transaction', item?.id, 'invoiceId'), recurrence_id: ref(item?.recurrenceId, recurrenceIds, 'transaction', item?.id, 'recurrenceId'),
    installment_group_id: text(item?.installmentGroupId), installment_number: integer(item?.installmentNumber), installment_total: integer(item?.installmentTotal),
    is_paid: typeof item?.isPaid === 'boolean' ? item.isPaid : ['paid','received'].includes(item?.status), is_cancelled: typeof item?.isCancelled === 'boolean' ? item.isCancelled : item?.status === 'cancelled',
  })), 'transaction')
  const transfers = duplicateSafe(list(state.transfers).map((item, index) => ({
    ...common(item, context), id: identity(item?.transferId, 'transfer', index), source_account_id: ref(item?.sourceAccountId, accountIds, 'transfer', item?.transferId, 'sourceAccountId'),
    destination_account_id: ref(item?.destinationAccountId, accountIds, 'transfer', item?.transferId, 'destinationAccountId'), amount: number(item?.amount), fee_amount: number(item?.fee),
    scheduled_date: civilDate(item?.date ?? item?.dueDate), completed_at: timestamp(item?.completedAt), cancelled_at: timestamp(item?.cancelledAt),
    reversed_at: timestamp(item?.reversal?.createdAt), status: item?.reversal ? 'reversed' : text(item?.status), recurrence_id: ref(item?.recurrenceId, recurrenceIds, 'transfer', item?.transferId, 'recurrenceId'),
  })), 'transfer')
  return { mapperVersion: RELATIONAL_MAPPER_VERSION, source: context, entities: { accounts, cards, categories, costCenters, recurrences, invoiceRecords, transactions, transfers }, issues }
}

export const RELATIONAL_TABLES = Object.freeze({ accounts: 'financial_accounts', cards: 'payment_cards', categories: 'financial_categories', costCenters: 'cost_centers', recurrences: 'financial_recurrences', invoiceRecords: 'credit_card_invoice_records', transactions: 'financial_transactions', transfers: 'financial_transfers' })
