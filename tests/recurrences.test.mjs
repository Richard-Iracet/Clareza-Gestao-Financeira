import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceRecurrenceAfterGeneration,
  buildTransactionOccurrenceSpec,
  buildTransferOccurrenceSpec,
  canDeleteRecurrence,
  createRecurrence,
  getRecurrenceOccurrenceKey,
  deleteRecurrence,
  getNextOccurrenceDate,
  planRecurrenceOccurrences,
  validateRecurrenceRecord,
} from '../src/domain/recurrences/recurrenceService.js'
import { buildFinanceAlerts, dismissAlert, snoozeAlert } from '../src/domain/alerts/alertSelectors.js'
import { defaultFilters, filterTransactions, filterTransfers } from '../src/utils/filtering.js'

const timestamp = '2026-01-01T12:00:00.000Z'
const accounts = [
  { accountId: 'checking', name: 'Conta corrente', archived: false, initialBalance: 100, initialBalanceDate: '2026-01-01' },
  { accountId: 'savings', name: 'Reserva', archived: false, initialBalance: 50, initialBalanceDate: '2026-01-01' },
]

const recurrence = (overrides = {}) => ({
  recurrenceId: 'recurrence-1',
  type: 'expense',
  frequency: 'monthly',
  interval: 1,
  startDate: '2026-01-31',
  endDate: null,
  occurrenceLimit: null,
  nextOccurrenceDate: '2026-01-31',
  amount: 120,
  description: 'Internet',
  category: 'Casa',
  accountId: 'checking',
  paymentMethod: 'Pix',
  cardId: null,
  sourceAccountId: null,
  destinationAccountId: null,
  status: 'active',
  generationMode: 'automatic',
  advanceGenerationDays: 60,
  reminderDaysBefore: 7,
  createdAt: timestamp,
  updatedAt: timestamp,
  notes: '',
  ...overrides,
})

test('fase 26: valida regras, referências e cartão apenas para despesa em crédito', () => {
  assert.equal(validateRecurrenceRecord(recurrence(), { accounts }).valid, true)
  assert.equal(validateRecurrenceRecord(recurrence({ cardId: 'card-1', paymentMethod: 'Crédito' }), { accounts, cards: [{ id: 'card-1', name: 'Cartão' }] }).valid, true)
  assert.equal(validateRecurrenceRecord(recurrence({ type: 'income', cardId: 'card-1', paymentMethod: 'Crédito' }), { accounts, cards: [{ id: 'card-1' }] }).valid, false)
  assert.equal(validateRecurrenceRecord(recurrence({ accountId: 'missing' }), { accounts }).valid, false)
  const created = createRecurrence({ ...recurrence(), recurrenceId: undefined }, { recurrenceId: 'created-rule', accounts, cards: [] })
  assert.equal(created.success, true)
  assert.equal(created.recurrence.recurrenceId, 'created-rule')
})

test('fase 26: calendário preserva a âncora mensal e o tratamento de ano bissexto', () => {
  const monthly = recurrence({ startDate: '2024-01-31', nextOccurrenceDate: '2024-01-31' })
  const february = getNextOccurrenceDate(monthly, '2024-01-31')
  assert.equal(february, '2024-02-29')
  assert.equal(getNextOccurrenceDate(monthly, february), '2024-03-31')
  const yearly = recurrence({ frequency: 'yearly', startDate: '2024-02-29', nextOccurrenceDate: '2024-02-29' })
  assert.equal(getNextOccurrenceDate(yearly, '2024-02-29'), '2025-02-28')
  assert.equal(getNextOccurrenceDate(yearly, '2025-02-28'), '2026-02-28')
  assert.equal(getNextOccurrenceDate(yearly, '2027-02-28'), '2028-02-29')
})

test('fase 26: planejamento é limitado, idempotente e gera despesas pendentes', () => {
  const rule = recurrence()
  const plan = planRecurrenceOccurrences(rule, { accounts, referenceDate: '2026-01-01' })
  assert.equal(plan.success, true)
  assert.deepEqual(plan.transactionOccurrences.map((item) => item.scheduledOccurrenceDate), ['2026-01-31', '2026-02-28'])
  assert.ok(plan.transactionOccurrences.every((item) => item.status === 'pending' && item.installment === '1/1'))
  assert.equal(plan.nextOccurrenceDate, '2026-03-31')
  const repeated = planRecurrenceOccurrences(rule, { accounts, transactions: plan.transactionOccurrences, referenceDate: '2026-01-01' })
  assert.equal(repeated.occurrences.length, 0)
  assert.equal(repeated.skippedExisting.length, 2)
  const advanced = advanceRecurrenceAfterGeneration(rule, plan, { updatedAt: '2026-01-02T12:00:00.000Z' })
  assert.equal(advanced.success, true)
  assert.equal(advanced.recurrence.nextOccurrenceDate, '2026-03-31')
})

test('fase 26: respeita limite de ocorrência e deixa transferência recorrente agendada', () => {
  const limited = recurrence({ occurrenceLimit: 2, advanceGenerationDays: 120 })
  const plan = planRecurrenceOccurrences(limited, { accounts, referenceDate: '2026-01-01' })
  assert.equal(plan.occurrences.length, 2)
  assert.equal(plan.completed, true)
  assert.equal(advanceRecurrenceAfterGeneration(limited, plan).recurrence.status, 'completed')
  const transfer = recurrence({
    recurrenceId: 'transfer-rule', type: 'transfer', category: '', accountId: null, paymentMethod: '', cardId: null,
    sourceAccountId: 'checking', destinationAccountId: 'savings', description: 'Reserva mensal',
  })
  const occurrence = buildTransferOccurrenceSpec(transfer, '2026-01-31')
  assert.equal(occurrence.status, 'scheduled')
  assert.equal(occurrence.fee, 0)
  assert.equal(occurrence.recurrenceType, 'transfer')
})

test('fase 26: recorrência de cartão cria compra única 1/1 sem conta bancária', () => {
  const cardRule = recurrence({ accountId: null, cardId: 'card-1', paymentMethod: 'Crédito' })
  const occurrence = buildTransactionOccurrenceSpec(cardRule, '2026-01-31')
  assert.equal(occurrence.cardId, 'card-1')
  assert.equal(occurrence.accountId, null)
  assert.equal(occurrence.installment, '1/1')
  assert.equal(occurrence.installmentTotal, 1)
  assert.equal(occurrence.status, 'pending')
})

test('fase 26: recorrência com ocorrências geradas não pode ser excluída', () => {
  const generated = [{ id: 'transaction-1', recurrenceId: 'recurrence-1', recurrenceType: 'expense', scheduledOccurrenceDate: '2026-01-31', type: 'expense' }]
  assert.equal(canDeleteRecurrence('recurrence-1', { transactions: generated }).canDelete, false)
  assert.equal(deleteRecurrence([recurrence()], 'recurrence-1', { transactions: generated }).success, false)
})

test('fase 26: alertas são derivados e o estado de dispensar/soneca é separado', () => {
  const result = buildFinanceAlerts({
    referenceDate: '2026-01-10',
    accounts,
    transactions: [{ id: 'late', type: 'expense', amount: 80, status: 'pending', description: 'Aluguel', date: '2026-01-01', dueDate: '2026-01-05', accountId: 'checking' }],
    transfers: [], invoices: [], invoiceRecords: [], recurrences: [], cards: [],
  })
  assert.equal(result.visible.length, 1)
  const alertKey = result.visible[0].alertKey
  const dismissed = dismissAlert([], alertKey, { updatedAt: timestamp })
  assert.equal(buildFinanceAlerts({ referenceDate: '2026-01-10', accounts, transactions: [{ id: 'late', type: 'expense', amount: 80, status: 'pending', description: 'Aluguel', date: '2026-01-01', dueDate: '2026-01-05', accountId: 'checking' }], transfers: [], invoices: [], invoiceRecords: [], recurrences: [], cards: [], alertStates: dismissed }).visible.length, 0)
  const snoozed = snoozeAlert([], alertKey, '2026-01-12', { updatedAt: timestamp })
  assert.equal(snoozed.success, true)
  assert.equal(buildFinanceAlerts({ referenceDate: '2026-01-10', accounts, transactions: [{ id: 'late', type: 'expense', amount: 80, status: 'pending', description: 'Aluguel', date: '2026-01-01', dueDate: '2026-01-05', accountId: 'checking' }], transfers: [], invoices: [], invoiceRecords: [], recurrences: [], cards: [], alertStates: snoozed.alertStates }).visible.length, 0)
})

test('fase 26: recorrência manual exige ação explícita e não é gerada na inicialização', () => {
  const manual = recurrence({ generationMode: 'manual' })
  const automaticPlan = planRecurrenceOccurrences(manual, { accounts, referenceDate: '2026-01-01' })
  assert.equal(automaticPlan.skipped, true)
  assert.equal(automaticPlan.reason, 'MANUAL_GENERATION')
  const manualPlan = planRecurrenceOccurrences(manual, { accounts, referenceDate: '2026-01-01', force: true })
  assert.equal(manualPlan.success, true)
  assert.equal(manualPlan.occurrences.length, 2)
})

test('fase 26: cursor antigo avança sem criar histórico artificial de pendências', () => {
  const oldRule = recurrence({ startDate: '2025-01-31', nextOccurrenceDate: '2025-01-31' })
  const plan = planRecurrenceOccurrences(oldRule, { accounts, referenceDate: '2026-01-01' })
  assert.equal(plan.success, true)
  assert.equal(plan.skippedPast.length, 12)
  assert.deepEqual(plan.occurrences.map((item) => item.scheduledOccurrenceDate), ['2026-01-31', '2026-02-28'])
})

test('fase 26: tombstone de cancelamento individual impede recriação da ocorrência', () => {
  const cancelledKey = getRecurrenceOccurrenceKey('recurrence-1', '2026-01-31', 'expense')
  const rule = recurrence({ cancelledOccurrenceKeys: [cancelledKey] })
  const plan = planRecurrenceOccurrences(rule, { accounts, referenceDate: '2026-01-01' })
  assert.equal(plan.skippedCancelled.length, 1)
  assert.deepEqual(plan.occurrences.map((item) => item.scheduledOccurrenceDate), ['2026-02-28'])
})

test('fase 26: filtros isolam ocorrências recorrentes e transferências futuras ou atrasadas', () => {
  const records = [
    { id: 'recurring', type: 'expense', amount: 10, status: 'pending', description: 'Internet', date: '2026-02-01', dueDate: '2026-02-01', recurrenceId: 'recurrence-1', generatedFromRecurrence: true },
    { id: 'manual', type: 'expense', amount: 10, status: 'pending', description: 'Avulsa', date: '2026-02-01', dueDate: '2026-02-01' },
  ]
  assert.deepEqual(filterTransactions(records, { ...defaultFilters, recurrenceScope: 'recurring' }).map((item) => item.id), ['recurring'])
  const transferRecords = [
    { transferId: 'late', sourceAccountId: 'checking', destinationAccountId: 'savings', amount: 10, date: '2026-01-01', status: 'scheduled', description: '' },
    { transferId: 'future', sourceAccountId: 'checking', destinationAccountId: 'savings', amount: 10, date: '2026-02-01', status: 'scheduled', description: '' },
  ]
  assert.deepEqual(filterTransfers(transferRecords, { ...defaultFilters, overdueOnly: true }, { accounts, referenceDate: new Date(2026, 0, 10) }).map((item) => item.transferId), ['late'])
  assert.deepEqual(filterTransfers(transferRecords, { ...defaultFilters, futureOnly: true }, { accounts, referenceDate: new Date(2026, 0, 10) }).map((item) => item.transferId), ['future'])
})

test('fase 26: falhas parciais de geração se tornam alerta interno sem alterar dados', () => {
  const alerts = buildFinanceAlerts({
    referenceDate: '2026-01-10', accounts, transactions: [], transfers: [], invoices: [], invoiceRecords: [], cards: [],
    recurrences: [recurrence({ generationError: 'Fatura já paga.', generationFailedAt: '2026-01-10T12:00:00.000Z' })],
  })
  assert.ok(alerts.visible.some((alert) => alert.type === 'recurrence-generation-failed'))
})
