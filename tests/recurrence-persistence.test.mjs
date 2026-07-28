import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, importBackup } from '../src/utils/backup.js'
import { validateBackup } from '../src/utils/dataValidation.js'
import { analyzeFinanceData } from '../src/utils/financeDiagnostics.js'
import { checksum, createSnapshot, persistSnapshot, validateSnapshot } from '../src/utils/snapshot.js'
import { STORAGE_KEYS } from '../src/utils/storage.js'
import { migrateRecurrencesState } from '../src/utils/recurrenceMigration.js'
import { createRecurrence, buildTransferOccurrenceSpec } from '../src/domain/recurrences/recurrenceService.js'
import { createTransfer } from '../src/domain/transfers/transferService.js'
import { loadFinanceState } from '../src/infrastructure/storage/financeRepository.js'
import { MemoryStorage } from './helpers/memoryStorage.mjs'

const accounts = [
  { accountId: 'checking', name: 'Conta corrente', institution: 'Banco', type: 'checking', currency: 'BRL', initialBalance: 100, initialBalanceDate: '2026-01-01', includeInTotalBalance: true, archived: false },
  { accountId: 'savings', name: 'Reserva', institution: 'Banco', type: 'savings', currency: 'BRL', initialBalance: 50, initialBalanceDate: '2026-01-01', includeInTotalBalance: true, archived: false },
]

const transferRecurrence = () => createRecurrence({
  type: 'transfer', frequency: 'monthly', interval: 1, startDate: '2026-02-28', nextOccurrenceDate: '2026-02-28', amount: 80,
  description: 'Reserva mensal', category: '', sourceAccountId: 'checking', destinationAccountId: 'savings', generationMode: 'automatic', advanceGenerationDays: 60, reminderDaysBefore: 7, notes: '',
}, { recurrenceId: 'recurrence-transfer', createdAt: '2026-01-10T10:00:00.000Z', updatedAt: '2026-01-10T10:00:00.000Z', accounts, cards: [] }).recurrence

test('fase 26: snapshot, backup e importacao preservam recorrencias e estados de alerta sem exigir dados legados', () => {
  const recurrence = transferRecurrence()
  assert.ok(recurrence)
  const occurrence = buildTransferOccurrenceSpec(recurrence, '2026-02-28')
  const transfer = createTransfer(occurrence, { accounts, transferId: 'transfer-recurring', existingTransfers: [], createdAt: '2026-01-10T10:00:00.000Z' })
  assert.equal(transfer.success, true)
  assert.equal(transfer.transfer.recurrenceType, 'transfer')
  assert.equal(transfer.transfer.recurrenceVersion, recurrence.updatedAt)

  const state = {
    transactions: [], cards: [], accounts, transfers: [transfer.transfer], recurrences: [recurrence],
    alertStates: [{ alertKey: 'recurring-transfer:recurrence-transfer:2026-02-28', read: true, dismissed: false, dismissedAt: null, snoozedUntil: null, updatedAt: '2026-01-10T10:00:00.000Z' }],
    categories: [], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: { financeDataVersion: 4, recurrenceMigrationVersion: 1 },
  }
  const backend = new MemoryStorage()
  assert.equal(persistSnapshot(createSnapshot(state, { revision: 1 }), backend).success, true)
  assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.recurrences))[0].recurrenceId, recurrence.recurrenceId)
  assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.alertStates))[0].alertKey, state.alertStates[0].alertKey)

  const backup = createBackup(backend, { ...state, invoicePayments: state.invoiceRecords })
  assert.equal(backup.metadata.counts.recurrences, 1)
  assert.equal(backup.metadata.counts.alertStates, 1)
  assert.equal(validateBackup(backup).valid, true)
  const target = new MemoryStorage()
  assert.equal(importBackup(backup, target).success, true)
  const restored = loadFinanceState(target, null).snapshot.data
  assert.equal(restored.recurrences[0].recurrenceId, recurrence.recurrenceId)
  assert.equal(restored.alertStates[0].alertKey, state.alertStates[0].alertKey)
})

test('fase 26: migracao e validacao mantem compatibilidade com snapshots e backups sem colecoes recorrentes', () => {
  const first = migrateRecurrencesState({ transactions: [] })
  const second = migrateRecurrencesState(first.state)
  assert.equal(first.report.recurrencesIntroduced, true)
  assert.equal(first.report.alertStatesIntroduced, true)
  assert.deepEqual(second.state, first.state)

  const legacy = createSnapshot({ transactions: [], cards: [], categories: [], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: {} }, { revision: 1 })
  delete legacy.data.recurrences
  delete legacy.data.alertStates
  delete legacy.metadata.counts.recurrences
  delete legacy.metadata.counts.alertStates
  const { checksum: ignored, ...legacyCore } = legacy
  legacy.checksum = checksum(legacyCore)
  assert.equal(validateSnapshot(legacy).valid, true)
})

test('fase 26: diagnostico encontra ocorrencias recorrentes duplicadas ou desconectadas sem modificar dados', () => {
  const recurrence = transferRecurrence()
  const occurrence = buildTransferOccurrenceSpec(recurrence, '2026-02-28')
  const report = analyzeFinanceData({
    transactions: [], cards: [], accounts, invoiceRecords: [], financeVersion: 4, recurrences: [recurrence], alertStates: [],
    transfers: [
      { ...createTransfer(occurrence, { accounts, transferId: 'first', existingTransfers: [], createdAt: '2026-01-10T10:00:00.000Z' }).transfer },
      { ...createTransfer(occurrence, { accounts, transferId: 'second', existingTransfers: [], createdAt: '2026-01-10T10:00:00.000Z' }).transfer },
    ],
  })
  const ids = new Set(report.issues.map((item) => item.id))
  assert.ok(ids.has('duplicate-recurrence-occurrences'))
  assert.equal(report.summary.recurrences, 1)
})

test('fase 26: importação rejeita duplicidade semântica de uma mesma ocorrência mesmo com IDs diferentes', () => {
  const recurrence = transferRecurrence()
  const occurrence = buildTransferOccurrenceSpec(recurrence, '2026-02-28')
  const first = createTransfer(occurrence, { accounts, transferId: 'first', operationId: 'first-operation', createdAt: '2026-01-10T10:00:00.000Z' }).transfer
  const second = {
    ...createTransfer({ ...occurrence, operationId: 'second-operation', recurrenceOccurrenceId: 'custom-occurrence-id' }, { accounts, transferId: 'second', operationId: 'second-operation', createdAt: '2026-01-10T10:00:00.000Z' }).transfer,
    recurrenceOccurrenceId: 'custom-occurrence-id',
  }
  const state = { transactions: [], cards: [], accounts, transfers: [first, second], recurrences: [recurrence], alertStates: [], categories: [], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: { financeDataVersion: 4, recurrenceMigrationVersion: 1 } }
  const backup = createBackup(new MemoryStorage(), { ...state, invoicePayments: state.invoiceRecords })
  assert.equal(validateBackup(backup).valid, false)
  assert.match(validateBackup(backup).errors.join(' '), /duplicadas/i)
})

test('fase 26: diagnóstico aponta cursor inválido, excesso de limite e falha parcial sem corrigir dados', () => {
  const recurrence = { ...transferRecurrence(), nextOccurrenceDate: '2026-02-27', occurrenceLimit: 1, generationError: 'Conta indisponível.' }
  const first = createTransfer(buildTransferOccurrenceSpec(recurrence, '2026-02-28'), { accounts, transferId: 'first-limit', operationId: 'first-limit-operation', createdAt: '2026-01-10T10:00:00.000Z' }).transfer
  const second = createTransfer(buildTransferOccurrenceSpec(recurrence, '2026-03-28'), { accounts, transferId: 'second-limit', operationId: 'second-limit-operation', createdAt: '2026-01-10T10:00:00.000Z' }).transfer
  const report = analyzeFinanceData({ transactions: [], cards: [], accounts, transfers: [first, second], recurrences: [recurrence], alertStates: [], categories: [], invoiceRecords: [], financeVersion: 4 })
  const ids = new Set(report.issues.map((item) => item.id))
  ;['invalid-recurrence-cursors', 'recurrence-occurrence-limit-exceeded', 'recurrence-generation-failures'].forEach((id) => assert.ok(ids.has(id), id))
})
