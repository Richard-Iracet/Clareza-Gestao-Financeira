import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, importBackup, INTERNAL_IMPORT_BACKUP_KEY } from '../src/utils/backup.js'
import { parseAndValidateBackup, validateBackup } from '../src/utils/dataValidation.js'
import { analyzeFinanceData, runFinanceDiagnostics } from '../src/utils/financeDiagnostics.js'

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)) }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
  key(index) { return [...this.values.keys()][index] ?? null }
  get length() { return this.values.size }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()) }
}

const transaction = { id: 't-1', description: 'Mercado', amount: 100, type: 'expense', status: 'pending', category: 'Mercado' }
const card = { id: 'nubank', name: 'Nubank', closingDay: 25, dueDay: 3 }
const baseStorage = () => new MemoryStorage({
  'clareza:transactions': JSON.stringify([transaction]), 'clareza:cards': JSON.stringify([card]),
  'clareza:categories': JSON.stringify(['Mercado']), 'clareza:invoices': JSON.stringify([]),
  financeDataVersion: JSON.stringify(4),
})

test('exportação produz backup completo sem modificar o LocalStorage', () => {
  const storage = baseStorage()
  const before = storage.snapshot()
  const backup = createBackup(storage)
  assert.equal(storage.snapshot(), before)
  assert.equal(backup.format, 'clareza-finance-backup')
  assert.equal(backup.metadata.counts.transactions, 1)
  assert.deepEqual(backup.data.transactions, [transaction])
  assert.equal(validateBackup(backup).valid, true)
})

test('importação válida cria backup interno e restaura todas as coleções', () => {
  const source = baseStorage()
  const backup = createBackup(source)
  const target = new MemoryStorage({ 'clareza:transactions': JSON.stringify([{ ...transaction, id: 'old' }]), 'clareza:cards': JSON.stringify([card]), 'clareza:categories': JSON.stringify([]), 'clareza:invoices': JSON.stringify([]), financeDataVersion: '4' })
  const result = importBackup(backup, target)
  assert.equal(result.success, true)
  assert.ok(target.getItem(INTERNAL_IMPORT_BACKUP_KEY))
  assert.deepEqual(JSON.parse(target.getItem('clareza:transactions')), [transaction])
  assert.deepEqual(JSON.parse(target.getItem('clareza:categories')), ['Mercado'])
})

test('backup estruturalmente inválido não altera nenhum dado', () => {
  const storage = baseStorage()
  const before = storage.snapshot()
  assert.throws(() => importBackup({ format: 'incompleto' }, storage))
  assert.equal(storage.snapshot(), before)
})

test('arquivo corrompido e versão incompatível são rejeitados', () => {
  assert.equal(parseAndValidateBackup('{quebrado').valid, false)
  const backup = createBackup(baseStorage())
  backup.version = 999
  const validation = validateBackup(backup)
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.includes('incompatível')))
})

test('dados importados permanecem disponíveis em uma nova leitura', () => {
  const backup = createBackup(baseStorage())
  const storage = baseStorage()
  importBackup(backup, storage)
  const restartedSnapshot = createBackup(storage)
  assert.deepEqual(restartedSnapshot.data.transactions, backup.data.transactions)
  assert.deepEqual(restartedSnapshot.data.cards, backup.data.cards)
})

test('diagnóstico saudável é somente leitura', () => {
  const storage = baseStorage()
  const before = storage.snapshot()
  const report = runFinanceDiagnostics(storage)
  assert.equal(storage.snapshot(), before)
  assert.equal(report.healthy, true)
})

test('diagnóstico identifica duplicidades, parcelas, datas, cartões e faturas órfãs', () => {
  const broken = [
    { ...transaction, id: 'dup', cardId: 'missing', invoiceId: null, installmentNumber: 2, installmentTotal: 3, amount: 100, installmentAmount: 90, date: '2026-02-30' },
    { ...transaction, id: 'dup', cardId: 'nubank', invoiceId: 'nubank-2026-13', invoiceMonth: 13, invoiceYear: 2026, installmentGroupId: 'g', installmentNumber: 1, installmentTotal: 3 },
    { ...transaction, id: 'three', cardId: 'nubank', invoiceId: 'nubank-2026-03', invoiceMonth: 3, invoiceYear: 2026, installmentGroupId: 'g', installmentNumber: 3, installmentTotal: 3 },
  ]
  const report = analyzeFinanceData({ transactions: broken, cards: [card], invoiceRecords: [{ id: 'orphan-2026-01', status: 'paid' }], financeVersion: 4 })
  const ids = new Set(report.issues.map((item) => item.id))
  assert.equal(report.healthy, false)
  ;['duplicate-ids', 'installments-without-group', 'missing-installments', 'inconsistent-installment-values', 'invalid-dates', 'unknown-cards', 'card-purchases-without-invoice', 'orphan-invoices', 'invalid-competence'].forEach((id) => assert.ok(ids.has(id), id))
})
