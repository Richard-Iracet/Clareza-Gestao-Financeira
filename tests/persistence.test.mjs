import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshot, persistSnapshot, resolveSnapshot, validateSnapshot } from '../src/utils/snapshot.js'
import { readStorage, STORAGE_KEYS, testStorageAvailability, writeStorage } from '../src/utils/storage.js'

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)) }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}
const transaction = { id: 't-1', description: 'Mercado', amount: 100, type: 'expense' }
const card = { id: 'nubank', name: 'Nubank', closingDay: 25, dueDay: 3 }
const data = { transactions: [transaction], cards: [card], categories: ['Mercado'], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: { financeDataVersion: 4 } }

test('promove snapshot validado e preserva o anterior', () => {
  const backend = new MemoryStorage(); assert.equal(persistSnapshot(createSnapshot(data, { revision: 1 }), backend).success, true); assert.equal(persistSnapshot(createSnapshot(data, { revision: 2 }), backend).success, true)
  assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.current)).revision, 2); assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.lastValid)).revision, 1); assert.equal(backend.getItem(STORAGE_KEYS.temp), null)
})

test('detecta corrupção e recupera o último válido sem sobrescrever o corrompido', () => {
  const backend = new MemoryStorage(); persistSnapshot(createSnapshot(data, { revision: 1 }), backend); persistSnapshot(createSnapshot(data, { revision: 2 }), backend)
  const corrupt = JSON.parse(backend.getItem(STORAGE_KEYS.current)); corrupt.data.transactions[0].amount = 999; backend.setItem(STORAGE_KEYS.current, JSON.stringify(corrupt))
  assert.equal(validateSnapshot(corrupt).valid, false); const resolved = resolveSnapshot(backend, null)
  assert.equal(resolved.source, 'lastValid'); assert.equal(resolved.snapshot.data.transactions[0].amount, 100); assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.current)).data.transactions[0].amount, 999)
})

test('classifica quota e acesso sem lançar exceção', () => {
  const quota = { getItem: () => null, setItem: () => { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error } }
  const denied = { getItem: () => { const error = new Error('denied'); error.name = 'SecurityError'; throw error } }
  assert.equal(writeStorage('x', {}, quota).errorType, 'QUOTA_EXCEEDED'); assert.equal(resolveSnapshot(denied, null).recoveryRequired, true)
})

test('interrupção na promoção conserva estado atual e último válido', () => {
  const backend = new MemoryStorage(); persistSnapshot(createSnapshot(data, { revision: 1 }), backend); let fail = true
  const flaky = { getItem: (key) => backend.getItem(key), removeItem: (key) => backend.removeItem(key), setItem: (key, value) => { if (key === STORAGE_KEYS.current && fail) { fail = false; throw new Error('interrupted') } backend.setItem(key, value) } }
  assert.equal(persistSnapshot(createSnapshot(data, { revision: 2 }), flaky).success, false); assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.current)).revision, 1); assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.lastValid)).revision, 1)
})

test('sequência rápida mantém a revisão mais nova completa', () => {
  const backend = new MemoryStorage()
  for (let revision = 1; revision <= 8; revision += 1) assert.equal(persistSnapshot(createSnapshot({ ...data, transactions: [{ ...transaction, amount: revision }] }, { revision }), backend).success, true)
  const current = JSON.parse(backend.getItem(STORAGE_KEYS.current)); assert.equal(current.revision, 8); assert.equal(current.data.transactions[0].amount, 8); assert.equal(validateSnapshot(current).valid, true)
})

test('leitura, serialização, JSON inválido, indisponibilidade e verificação são explícitos', () => {
  const backend = new MemoryStorage(); assert.equal(writeStorage('normal', { value: 1 }, backend).success, true); assert.deepEqual(readStorage('normal', null, backend).data, { value: 1 })
  const circular = {}; circular.self = circular; assert.equal(writeStorage('circular', circular, backend).errorType, 'SERIALIZATION_ERROR')
  backend.setItem('broken', '{'); assert.equal(readStorage('broken', null, backend).errorType, 'DESERIALIZATION_ERROR')
  assert.equal(testStorageAvailability(null).success, false)
  const divergent = { getItem: () => JSON.stringify({ other: true }), setItem: () => {}, removeItem: () => {} }; assert.equal(writeStorage('x', { value: 1 }, divergent).errorType, 'WRITE_VERIFICATION_ERROR')
})

test('recupera temporário válido e mantém compatibilidade com legado', () => {
  const temporary = new MemoryStorage(); temporary.setItem(STORAGE_KEYS.temp, JSON.stringify(createSnapshot(data, { revision: 3 })))
  assert.equal(resolveSnapshot(temporary, null).source, 'temp')
  const legacy = resolveSnapshot(new MemoryStorage(), data); assert.equal(legacy.source, 'legacy'); assert.equal(legacy.needsInitialSave, true)
  assert.equal(resolveSnapshot(new MemoryStorage(), null).recoveryRequired, true)
})
