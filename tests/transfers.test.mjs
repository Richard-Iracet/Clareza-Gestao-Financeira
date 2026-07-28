import test from 'node:test'
import assert from 'node:assert/strict'
import { cancelScheduledTransfer, completeScheduledTransfer, createTransfer, reverseCompletedTransfer, updateScheduledTransfer } from '../src/domain/transfers/transferService.js'
import { getTransferAccountMovements } from '../src/domain/transfers/transferSelectors.js'
import { deleteAccountSafely } from '../src/domain/accounts/accountService.js'
import { getAccountMovements, getAccountProjectedBalance, getAccountRealizedBalance, getConsolidatedBalance, getConsolidatedProjectedBalance } from '../src/domain/accounts/accountSelectors.js'
import { createBackup, importBackup } from '../src/utils/backup.js'
import { validateBackup } from '../src/utils/dataValidation.js'
import { analyzeFinanceData } from '../src/utils/financeDiagnostics.js'
import { defaultFilters, filterTransfers, filterTransactions } from '../src/utils/filtering.js'
import { getRealizedExpenses, getRealizedIncome } from '../src/utils/financialSelectors.js'
import { checksum, createSnapshot, persistSnapshot, validateSnapshot } from '../src/utils/snapshot.js'
import { STORAGE_KEYS } from '../src/utils/storage.js'
import { loadFinanceState } from '../src/infrastructure/storage/financeRepository.js'
import { migrateTransfersState } from '../src/utils/transferMigration.js'
import { MemoryStorage } from './helpers/memoryStorage.mjs'

const account = (accountId, overrides = {}) => ({
  accountId,
  name: accountId === 'source' ? 'Conta origem' : 'Conta destino',
  institution: 'Banco teste',
  type: 'checking',
  currency: 'BRL',
  initialBalance: accountId === 'source' ? 100 : 50,
  initialBalanceDate: '2026-01-01',
  includeInTotalBalance: true,
  archived: false,
  ...overrides,
})

const accounts = () => [account('source'), account('destination')]
const transferInput = (overrides = {}) => ({
  sourceAccountId: 'source',
  destinationAccountId: 'destination',
  amount: 100,
  date: '2026-01-05',
  status: 'completed',
  fee: 0,
  description: 'Reserva',
  notes: 'Teste',
  ...overrides,
})
const create = (input = {}, options = {}) => createTransfer(transferInput(input), {
  accounts: accounts(),
  transferId: options.transferId || 'transfer-1',
  operationId: options.operationId || 'operation-1',
  createdAt: options.createdAt || '2026-01-01T12:00:00.000Z',
  ...options,
})

test('fase 25: cria transferências concluídas e agendadas e bloqueia referências ou valores inválidos', () => {
  const completed = create()
  assert.equal(completed.success, true)
  assert.equal(completed.transfer.status, 'completed')
  assert.equal(completed.transfer.audit.at(-1).type, 'transfer_created')
  const scheduled = create({ status: 'scheduled', amount: 20 }, { transferId: 'scheduled', operationId: 'scheduled-op' })
  assert.equal(scheduled.success, true)
  ;[
    transferInput({ sourceAccountId: 'source', destinationAccountId: 'source' }),
    transferInput({ sourceAccountId: 'missing' }),
    transferInput({ destinationAccountId: 'missing' }),
    transferInput({ amount: 0 }),
    transferInput({ amount: -1 }),
    transferInput({ fee: 2 }),
  ].forEach((input, index) => assert.equal(createTransfer(input, { accounts: accounts(), transferId: `invalid-${index}`, operationId: `invalid-op-${index}` }).success, false))
  assert.equal(createTransfer(transferInput(), { accounts: [account('source', { archived: true }), account('destination')], transferId: 'archived', operationId: 'archived-op' }).success, false)
  assert.equal(createTransfer(transferInput(), { accounts: accounts(), existingTransfers: [completed.transfer], transferId: 'second', operationId: 'operation-1' }).duplicateOperation, true)
})

test('fase 25: saldos por conta, projeção e consolidado tratam a transferência sem alterar receitas ou despesas', () => {
  const completed = create().transfer
  const scheduled = create({ status: 'scheduled', amount: 40, date: '2026-02-10' }, { transferId: 'transfer-2', operationId: 'operation-2' }).transfer
  const allTransfers = [completed, scheduled]
  const [source, destination] = accounts()
  const reference = new Date(2026, 0, 10, 12)
  assert.equal(getAccountRealizedBalance(source, [], [], reference, allTransfers), 0)
  assert.equal(getAccountRealizedBalance(destination, [], [], reference, allTransfers), 150)
  assert.equal(getAccountProjectedBalance(source, [], [], reference, allTransfers), -40)
  assert.equal(getAccountProjectedBalance(destination, [], [], reference, allTransfers), 190)
  assert.equal(getConsolidatedBalance([source, destination], [], [], reference, allTransfers), 150)
  assert.equal(getConsolidatedProjectedBalance([source, destination], [], [], reference, allTransfers), 150)
  assert.equal(getConsolidatedBalance([source, { ...destination, includeInTotalBalance: false }], [], [], reference, allTransfers), 0)
  const transactions = [{ id: 'expense', type: 'expense', amount: 30, status: 'paid', date: '2026-01-05' }, { id: 'income', type: 'income', amount: 20, status: 'received', date: '2026-01-05' }]
  assert.equal(getRealizedExpenses(transactions), 30)
  assert.equal(getRealizedIncome(transactions), 20)
  assert.deepEqual(filterTransactions(transactions, defaultFilters).map((item) => item.id), ['expense', 'income'])
})

test('fase 25: histórico deriva duas pontas, cancelamento não impacta e estorno preserva o original', () => {
  const completed = create().transfer
  const [source, destination] = accounts()
  const reference = new Date(2026, 0, 10, 12)
  const sourceMovements = getTransferAccountMovements([completed], 'source', { mode: 'history', referenceDate: reference })
  const destinationMovements = getAccountMovements([], [], 'destination', { transfers: [completed] })
  assert.equal(sourceMovements[0].direction, 'out')
  assert.equal(destinationMovements[0].direction, 'in')
  const reversed = reverseCompletedTransfer(completed, { date: '2026-01-06', notes: 'Correção' }, { accounts: [source, destination], existingTransfers: [completed], operationId: 'reverse-1', createdAt: '2026-01-06T12:00:00.000Z' })
  assert.equal(reversed.success, true)
  assert.equal(getAccountRealizedBalance(source, [], [], reference, [reversed.transfer]), 100)
  assert.equal(getAccountRealizedBalance(destination, [], [], reference, [reversed.transfer]), 50)
  assert.equal(reverseCompletedTransfer(reversed.transfer, { date: '2026-01-07' }, { accounts: [source, destination], existingTransfers: [reversed.transfer], operationId: 'reverse-2' }).success, false)

  const scheduled = create({ status: 'scheduled', amount: 25 }, { transferId: 'scheduled', operationId: 'scheduled-create' }).transfer
  const updated = updateScheduledTransfer(scheduled, { amount: 30, description: 'Atualizada' }, { accounts: [source, destination], existingTransfers: [scheduled], operationId: 'scheduled-update' })
  assert.equal(updated.success, true)
  assert.equal(updated.transfer.amount, 30)
  const cancelled = cancelScheduledTransfer(updated.transfer, { accounts: [source, destination], existingTransfers: [updated.transfer], operationId: 'scheduled-cancel' })
  assert.equal(cancelled.success, true)
  assert.equal(getAccountProjectedBalance(source, [], [], reference, [cancelled.transfer]), 100)
  assert.equal(completeScheduledTransfer(cancelled.transfer, { accounts: [source, destination], existingTransfers: [cancelled.transfer], operationId: 'cancelled-complete' }).success, false)
})

test('fase 25: filtros de transferências isolam o histórico geral', () => {
  const first = create().transfer
  const second = create({ status: 'scheduled', amount: 25, date: '2026-02-02', description: 'Aplicação' }, { transferId: 'transfer-2', operationId: 'operation-2' }).transfer
  const options = { accounts: accounts() }
  assert.deepEqual(filterTransfers([first, second], { ...defaultFilters, sourceAccountId: 'source', transferStatus: 'scheduled' }, options).map((item) => item.transferId), ['transfer-2'])
  assert.deepEqual(filterTransfers([first, second], { ...defaultFilters, search: 'destino', dateFrom: '2026-01-01', dateTo: '2026-01-31' }, options).map((item) => item.transferId), ['transfer-1'])
  assert.equal(filterTransfers([first], { ...defaultFilters, transferScope: 'exclude' }, options).length, 0)
  assert.equal(filterTransactions([{ id: 'cash', description: 'Caixa', amount: 1, type: 'expense', date: '2026-01-01' }], { ...defaultFilters, transferScope: 'only' }).length, 0)
})

test('fase 25: snapshots, backup, importação e migração preservam transferências com compatibilidade legada', () => {
  const completed = create().transfer
  const state = { transactions: [], cards: [], accounts: accounts(), transfers: [completed], categories: [], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: { financeDataVersion: 4, transferMigrationVersion: 1 } }
  const backend = new MemoryStorage()
  assert.equal(persistSnapshot(createSnapshot(state, { revision: 1 }), backend).success, true)
  assert.equal(loadFinanceState(backend, null).snapshot.data.transfers[0].transferId, 'transfer-1')
  assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.transfers))[0].transferId, 'transfer-1')

  const backup = createBackup(new MemoryStorage(), { transactions: [], cards: [], accounts: state.accounts, transfers: state.transfers, categories: [], invoicePayments: [], filters: {} })
  assert.equal(backup.metadata.counts.transfers, 1)
  assert.equal(validateBackup(backup).valid, true)
  const target = new MemoryStorage()
  assert.equal(importBackup(backup, target).success, true)
  assert.equal(loadFinanceState(target, null).snapshot.data.transfers[0].transferId, 'transfer-1')

  const invalid = JSON.parse(JSON.stringify(backup))
  invalid.data.transfers[0].destinationAccountId = 'source'
  invalid.storage[STORAGE_KEYS.transfers][0].destinationAccountId = 'source'
  assert.equal(validateBackup(invalid).valid, false)
  const before = target.getItem(STORAGE_KEYS.current)
  assert.throws(() => importBackup(invalid, target))
  assert.equal(target.getItem(STORAGE_KEYS.current), before)

  const legacy = createSnapshot(state, { revision: 2 })
  delete legacy.data.transfers
  delete legacy.metadata.counts.transfers
  const { checksum: ignored, ...legacyCore } = legacy
  legacy.checksum = checksum(legacyCore)
  assert.equal(validateSnapshot(legacy).valid, true)
  const legacyStorage = new MemoryStorage()
  assert.equal(persistSnapshot(legacy, legacyStorage).success, true)
  assert.deepEqual(JSON.parse(legacyStorage.getItem(STORAGE_KEYS.transfers)), [])
  const legacyBackup = JSON.parse(JSON.stringify(backup))
  delete legacyBackup.data.transfers
  delete legacyBackup.storage[STORAGE_KEYS.transfers]
  assert.equal(validateBackup(legacyBackup).valid, true)
  const legacyTarget = new MemoryStorage()
  assert.equal(importBackup(legacyBackup, legacyTarget).success, true)
  assert.deepEqual(loadFinanceState(legacyTarget, null).snapshot.data.transfers, [])
  const firstMigration = migrateTransfersState({ transactions: [] })
  const secondMigration = migrateTransfersState(firstMigration.state)
  assert.equal(firstMigration.report.transfersIntroduced, true)
  assert.deepEqual(secondMigration.state, firstMigration.state)
})

test('fase 25: falha transacional preserva o snapshot anterior de transferências', () => {
  const baseline = { transactions: [], cards: [], accounts: accounts(), transfers: [], categories: [], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: {} }
  const backend = new MemoryStorage()
  assert.equal(persistSnapshot(createSnapshot(baseline, { revision: 1 }), backend).success, true)
  let failPromotion = true
  const flaky = {
    getItem: (key) => backend.getItem(key),
    removeItem: (key) => backend.removeItem(key),
    setItem: (key, value) => {
      if (key === STORAGE_KEYS.current && failPromotion) {
        failPromotion = false
        throw new Error('simulated transfer persistence failure')
      }
      backend.setItem(key, value)
    },
  }
  const transferState = { ...baseline, transfers: [create().transfer] }
  assert.equal(persistSnapshot(createSnapshot(transferState, { revision: 2 }), flaky).success, false)
  assert.deepEqual(loadFinanceState(backend, null).snapshot.data.transfers, [])
})

test('fase 25: diagnóstico e exclusão de conta detectam referências e lados parciais sem corrigir dados', () => {
  const source = account('source')
  const destination = account('destination')
  const broken = {
    ...create().transfer,
    transferId: 'broken',
    sourceAccountId: 'source',
    destinationAccountId: 'missing',
    amount: 0,
    status: 'scheduled',
    fee: 2,
  }
  const report = analyzeFinanceData({
    transactions: [{ id: 'legacy-side', transferId: 'broken', amount: 10, type: 'expense', status: 'paid', date: '2026-01-02' }],
    cards: [],
    accounts: [source, destination],
    transfers: [broken, { ...broken, transferId: 'broken' }],
    invoiceRecords: [],
    financeVersion: 4,
  })
  const ids = new Set(report.issues.map((item) => item.id))
  ;['duplicate-transfer-ids', 'duplicate-transfer-operations', 'invalid-transfer-account-references', 'invalid-transfer-amounts', 'invalid-transfer-fees', 'invalid-transfer-records', 'unexpected-transfer-transaction-sides', 'incomplete-transfer-sides', 'non-realized-transfer-affecting-balance'].forEach((id) => assert.ok(ids.has(id), id))
  assert.equal(deleteAccountSafely([source, destination], 'source', [], [], [create().transfer]).success, false)
})
