import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveAccount, createAccount, deleteAccountSafely, restoreAccount, updateAccount } from '../src/domain/accounts/accountService.js'
import { UNASSIGNED_ACCOUNT_ID, getAccountMovements, getAccountProjectedBalance, getAccountRealizedBalance, getConsolidatedBalance, getUnassignedTransactionsTotal } from '../src/domain/accounts/accountSelectors.js'
import { buildFinanceIndexes } from '../src/domain/transactions/transactionSelectors.js'
import { createBackup, importBackup } from '../src/utils/backup.js'
import { validateBackup } from '../src/utils/dataValidation.js'
import { analyzeFinanceData } from '../src/utils/financeDiagnostics.js'
import { defaultFilters, filterTransactions, matchTransactionSearch } from '../src/utils/filtering.js'
import { getRealizedExpenses } from '../src/utils/financialSelectors.js'
import { appendInvoicePayment } from '../src/utils/invoiceReconciliation.js'
import { migrateAccountsState } from '../src/utils/accountMigration.js'
import { checksum, createSnapshot, persistSnapshot, validateSnapshot } from '../src/utils/snapshot.js'
import { STORAGE_KEYS } from '../src/utils/storage.js'
import { loadFinanceState } from '../src/infrastructure/storage/financeRepository.js'
import { MemoryStorage } from './helpers/memoryStorage.mjs'

const account = (overrides = {}) => ({
  accountId: 'main',
  name: 'Conta principal',
  institution: 'Banco Teste',
  type: 'checking',
  currency: 'BRL',
  initialBalance: 100,
  initialBalanceDate: '2026-01-01',
  includeInTotalBalance: true,
  archived: false,
  ...overrides,
})

const transaction = (overrides = {}) => ({
  id: 'transaction',
  description: 'Lancamento',
  amount: 10,
  type: 'expense',
  status: 'paid',
  date: '2026-01-02',
  dueDate: '2026-01-02',
  installmentNumber: 1,
  installmentTotal: 1,
  ...overrides,
})

const state = (overrides = {}) => ({
  transactions: [transaction()],
  cards: [{ id: 'card', name: 'Cartao', closingDay: 25, dueDay: 3 }],
  accounts: [account()],
  categories: ['Casa'],
  invoiceRecords: [],
  costCenters: ['Pessoal'],
  filters: {},
  userSettings: {},
  migrations: { financeDataVersion: 4, accountMigrationVersion: 1 },
  ...overrides,
})

test('fase 24: conta valida saldo e data-base, confirma mudanca critica e preserva auditoria', () => {
  const created = createAccount({ name: 'Conta principal', type: 'checking', initialBalance: 100, initialBalanceDate: '2026-01-01' }, { accountId: 'main', operationId: 'create-account', createdAt: '2026-01-01T12:00:00.000Z' })
  assert.equal(created.success, true)
  assert.equal(created.account.audit[0].operationId, 'create-account')
  assert.equal(createAccount({ name: 'Invalida', type: 'checking', initialBalance: 0, initialBalanceDate: '2026-02-30' }).success, false)

  const pending = updateAccount(created.account, { initialBalance: 130, initialBalanceDate: '2026-01-02' }, { operationId: 'change-opening' })
  assert.equal(pending.requiresConfirmation, true)
  assert.equal(created.account.initialBalance, 100)
  const confirmed = updateAccount(created.account, { initialBalance: 130, initialBalanceDate: '2026-01-02' }, { operationId: 'change-opening', confirmInitialBalanceChange: true })
  assert.equal(confirmed.success, true)
  assert.equal(confirmed.account.initialBalance, 130)
  assert.equal(confirmed.account.audit.at(-1).operationId, 'change-opening')

  const archived = archiveAccount(confirmed.account, { operationId: 'archive-account' })
  assert.equal(archived.account.archived, true)
  const restored = restoreAccount(archived.account, { operationId: 'restore-account' })
  assert.equal(restored.account.archived, false)
})

test('fase 24: exclusao permanente so e permitida sem lancamentos ou pagamentos de fatura', () => {
  const source = account()
  const byTransaction = deleteAccountSafely([source], source.accountId, [transaction({ accountId: source.accountId })], [])
  assert.equal(byTransaction.success, false)
  assert.equal(byTransaction.errorCode, 'ACCOUNT_HAS_MOVEMENTS')
  const byInvoicePayment = deleteAccountSafely([source], source.accountId, [], [{ id: 'invoice', paymentHistory: [{ accountId: source.accountId, amount: 20 }] }])
  assert.equal(byInvoicePayment.success, false)
  assert.equal(byInvoicePayment.invoicePaymentCount, 1)
  assert.equal(deleteAccountSafely([source], source.accountId, [], []).success, true)
})

test('fase 24: saldo bancario ignora compra no cartao e debita pagamento da fatura somente uma vez', () => {
  const main = account()
  const transactions = [
    transaction({ id: 'income', accountId: 'main', type: 'income', amount: 50, status: 'received', date: '2026-01-02' }),
    transaction({ id: 'expense', accountId: 'main', amount: 20, status: 'paid', date: '2026-01-03' }),
    transaction({ id: 'planned', accountId: 'main', amount: 10, status: 'pending', date: '2026-01-04' }),
    transaction({ id: 'card-purchase', accountId: 'main', cardId: 'card', amount: 200, status: 'paid', date: '2026-01-03' }),
    transaction({ id: 'legacy', amount: 7, status: 'paid', date: '2026-01-03' }),
  ]
  const invoiceRecords = [{ id: 'card-2026-01', paymentHistory: [{ paymentId: 'payment-1', operationId: 'pay-1', accountId: 'main', amount: 30, paymentDate: '2026-01-03', paidAt: '2026-01-03T15:00:00.000Z' }] }]
  const reference = new Date(2026, 0, 5, 12)
  assert.equal(getAccountRealizedBalance(main, transactions, invoiceRecords, reference), 100)
  assert.equal(getAccountProjectedBalance(main, transactions, invoiceRecords, reference), 90)
  assert.equal(getAccountMovements(transactions, invoiceRecords, 'main').some((item) => item.id === 'card-purchase'), false)
  assert.equal(getRealizedExpenses(transactions), 227)
  assert.equal(getUnassignedTransactionsTotal(transactions, invoiceRecords), -7)
  assert.equal(getAccountMovements(transactions, invoiceRecords, UNASSIGNED_ACCOUNT_ID).some((item) => item.id === 'legacy'), true)
  assert.equal(getConsolidatedBalance([main, account({ accountId: 'excluded', initialBalance: 500, includeInTotalBalance: false }), account({ accountId: 'archived', initialBalance: 500, archived: true })], transactions, invoiceRecords, reference), 100)
})

test('fase 24: pagamento de fatura guarda conta, data financeira e operacao sem criar lancamento de consumo', () => {
  const invoice = { id: 'card-2026-01', status: 'open', totalPending: 75, transactions: [transaction({ cardId: 'card', invoiceId: 'card-2026-01', amount: 75 })] }
  const record = appendInvoicePayment({}, invoice, '2026-01-05T18:00:00.000Z', { accountId: 'main', paymentDate: '2026-01-05', notes: 'Pago via app', operationId: 'invoice-pay-1' })
  assert.equal(record.paymentHistory.length, 1)
  assert.deepEqual(Object.fromEntries(['accountId', 'paymentDate', 'operationId', 'amount'].map((key) => [key, record.paymentHistory[0][key]])), { accountId: 'main', paymentDate: '2026-01-05', operationId: 'invoice-pay-1', amount: 75 })
  assert.equal(record.audit.at(-1).type, 'invoice_payment_recorded')
})

test('fase 24: filtro e busca por conta nao inferem o campo legado e excluem cartoes', () => {
  const transactions = [
    transaction({ id: 'direct', accountId: 'main', type: 'income', status: 'received' }),
    transaction({ id: 'card', accountId: 'main', cardId: 'card' }),
    transaction({ id: 'legacy', account: 'Nubank', accountId: null }),
  ]
  const indexes = buildFinanceIndexes({ transactions, accounts: [account()], cards: [{ id: 'card', name: 'Cartao', closingDay: 25, dueDay: 3 }] })
  const selected = filterTransactions(transactions, { ...defaultFilters, accountId: 'main' })
  const unassigned = filterTransactions(transactions, { ...defaultFilters, accountId: UNASSIGNED_ACCOUNT_ID })
  assert.deepEqual(selected.map((item) => item.id), ['direct'])
  assert.deepEqual(unassigned.map((item) => item.id), ['legacy'])
  assert.equal(matchTransactionSearch(transactions[0], 'conta principal', { indexes }), true)
})

test('fase 24: migracao de contas e idempotente e nunca atribui o texto legado a uma conta', () => {
  const legacy = { transactions: [transaction({ account: 'Nubank' })] }
  const first = migrateAccountsState(legacy)
  const second = migrateAccountsState(first.state)
  assert.deepEqual(first.state.accounts, [])
  assert.equal('accountId' in first.state.transactions[0], false)
  assert.equal(first.report.transactionsChanged, 0)
  assert.deepEqual(second.state.transactions, first.state.transactions)
})

test('fase 24: snapshots e backups preservam contas e ainda aceitam estado legado sem chave accounts', () => {
  const backend = new MemoryStorage()
  const fullState = state()
  const snapshot = createSnapshot(fullState, { revision: 1 })
  assert.equal(persistSnapshot(snapshot, backend).success, true)
  assert.equal(loadFinanceState(backend, null).snapshot.data.accounts[0].accountId, 'main')

  const legacy = createSnapshot(fullState, { revision: 2 })
  delete legacy.data.accounts
  delete legacy.metadata.counts.accounts
  const { checksum: ignored, ...core } = legacy
  legacy.checksum = checksum(core)
  assert.equal(validateSnapshot(legacy).valid, true)
  const legacyBackend = new MemoryStorage()
  assert.equal(persistSnapshot(legacy, legacyBackend).success, true)
  assert.deepEqual(JSON.parse(legacyBackend.getItem(STORAGE_KEYS.accounts)), [])

  const staleStorage = new MemoryStorage({
    [STORAGE_KEYS.transactions]: JSON.stringify(fullState.transactions),
    [STORAGE_KEYS.cards]: JSON.stringify(fullState.cards),
    [STORAGE_KEYS.categories]: JSON.stringify(fullState.categories),
    [STORAGE_KEYS.accounts]: JSON.stringify([]),
    [STORAGE_KEYS.invoices]: JSON.stringify([]),
    [STORAGE_KEYS.dataVersion]: JSON.stringify(4),
  })
  const backup = createBackup(staleStorage, { transactions: fullState.transactions, cards: fullState.cards, accounts: fullState.accounts, categories: fullState.categories, invoicePayments: [], filters: {} })
  assert.equal(backup.snapshot.data.accounts[0].accountId, 'main')
  const target = new MemoryStorage()
  assert.equal(importBackup(backup, target).success, true)
  assert.equal(loadFinanceState(target, null).snapshot.data.accounts[0].accountId, 'main')
})

test('fase 24: backup invalido de conta nao altera dados e legado sem accounts continua importavel', () => {
  const backend = new MemoryStorage()
  const fullState = state()
  const backup = createBackup(backend, { transactions: fullState.transactions, cards: fullState.cards, accounts: fullState.accounts, categories: fullState.categories, invoicePayments: [], filters: {} })
  const invalid = JSON.parse(JSON.stringify(backup))
  invalid.data.accounts[0].initialBalanceDate = '2026-02-30'
  invalid.storage[STORAGE_KEYS.accounts][0].initialBalanceDate = '2026-02-30'
  assert.equal(validateBackup(invalid).valid, false)
  const target = new MemoryStorage({ marker: 'preserve' })
  const before = target.getItem('marker')
  assert.throws(() => importBackup(invalid, target))
  assert.equal(target.getItem('marker'), before)

  const legacy = JSON.parse(JSON.stringify(backup))
  delete legacy.data.accounts
  delete legacy.storage[STORAGE_KEYS.accounts]
  assert.equal(validateBackup(legacy).valid, true)
  assert.equal(importBackup(legacy, target).success, true)
  assert.deepEqual(loadFinanceState(target, null).snapshot.data.accounts, [])
})

test('fase 24: diagnostico encontra referencias de conta invalidas sem tratar legado sem conta como erro', () => {
  const report = analyzeFinanceData({
    transactions: [
      transaction({ id: 'unknown', accountId: 'missing' }),
      transaction({ id: 'card-with-account', cardId: 'card', accountId: 'main', invoiceId: 'card-2026-01', invoiceMonth: 1, invoiceYear: 2026 }),
      transaction({ id: 'legacy', account: 'Saldo em Conta', accountId: null }),
    ],
    cards: [{ id: 'card', name: 'Cartao', closingDay: 25, dueDay: 3 }],
    accounts: [account(), account({ accountId: 'main', name: 'Duplicada' }), account({ accountId: UNASSIGNED_ACCOUNT_ID, name: 'Virtual persistida' })],
    invoiceRecords: [{ id: 'card-2026-01', paymentHistory: [{ accountId: 'missing', amount: -5, paymentDate: '2026-02-30', operationId: 'duplicated' }, { accountId: 'missing', amount: 5, paymentDate: '2026-01-02', operationId: 'duplicated' }] }],
    financeVersion: 4,
  })
  const ids = new Set(report.issues.map((item) => item.id))
  ;['duplicate-account-ids', 'persisted-virtual-account', 'unknown-account-references', 'card-purchases-with-bank-account', 'unknown-invoice-payment-account', 'invalid-invoice-payment-history', 'duplicate-invoice-payment-operation'].forEach((id) => assert.ok(ids.has(id), id))
  assert.equal(report.issues.some((item) => item.id === 'legacy-unassigned-account'), false)
})
