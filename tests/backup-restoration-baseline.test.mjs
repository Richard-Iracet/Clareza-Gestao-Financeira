import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBackup, importBackup } from '../src/utils/backup.js'
import { createSnapshot, persistSnapshot, resolveSnapshot, validateSnapshot } from '../src/utils/snapshot.js'
import { parseAndValidateBackup } from '../src/utils/dataValidation.js'
import { STORAGE_KEYS } from '../src/utils/storage.js'
import { MemoryStorage } from './helpers/memoryStorage.mjs'
import { createBaselineReport } from '../src/domain/baseline/baselineReport.js'

const data = { transactions: [{ id: 't', description: 'Teste', amount: 10, type: 'expense' }], cards: [], accounts: [], transfers: [], recurrences: [], alertStates: [], categories: [], invoiceRecords: [], costCenters: [], filters: { search: 'x' }, userSettings: { financialCycleDay: 25 }, migrations: { financeDataVersion: 4 } }
test('exportação não modifica storage e round-trip preserva coleções, IDs e preferências', () => {
  const backend = new MemoryStorage(); persistSnapshot(createSnapshot(data, { revision: 1 }), backend); const before = new Map(backend.values); const backup = createBackup(backend, data); assert.deepEqual(backend.values, before); assert.equal(backup.version, 1); assert.equal(backup.metadata.appMetadata.snapshotSchemaVersion, 1); assert.deepEqual(backup.data.savedFilters, data.filters); assert.deepEqual(backup.data.userSettings, data.userSettings)
  const target = new MemoryStorage(); importBackup(backup, target); const restored = resolveSnapshot(target, null).snapshot.data; assert.equal(restored.transactions[0].id, 't'); assert.equal(restored.transactions[0].amount, 10); assert.deepEqual(restored.filters, data.filters)
  const reportOptions = { referenceDate: new Date(2026, 0, 1), generatedAt: '2026-01-01T12:00:00.000Z' }
  assert.equal(createBaselineReport(data, reportOptions).reportChecksum, createBaselineReport(restored, reportOptions).reportChecksum)
})
test('backup truncado ou obrigatório ausente é rejeitado sem escrita', () => {
  const backend = new MemoryStorage({ keep: 'yes' }); assert.equal(parseAndValidateBackup('{').valid, false); const valid = createBackup(new MemoryStorage(), data); delete valid.data.transactions; const before = new Map(backend.values); assert.throws(() => importBackup(valid, backend)); assert.deepEqual(backend.values, before)
})
test('fixture de backup v1 sem coleções opcionais continua importável', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/legacy-backup-v1.json', import.meta.url), 'utf8'))
  const backend = new MemoryStorage(); assert.equal(importBackup(legacy, backend).success, true)
  const restored = resolveSnapshot(backend, null).snapshot.data
  assert.deepEqual(restored.accounts, []); assert.deepEqual(restored.transfers, []); assert.deepEqual(restored.recurrences, []); assert.deepEqual(restored.alertStates, [])
})
test('corrupções de snapshot são classificadas e lastValid permanece recuperável', () => {
  const backend = new MemoryStorage(); persistSnapshot(createSnapshot(data, { revision: 1 }), backend); persistSnapshot(createSnapshot(data, { revision: 2 }), backend); const variants = [
    (s) => { s.checksum = 'bad' }, (s) => { s.state = 'writing' }, (s) => { s.revision = 0 }, (s) => { s.schemaVersion = 99 }, (s) => { s.metadata.counts.transactions = 99 },
  ]
  variants.forEach((mutate) => { const value = JSON.parse(backend.getItem(STORAGE_KEYS.current)); mutate(value); assert.equal(validateSnapshot(value).valid, false) })
  const corrupt = JSON.parse(backend.getItem(STORAGE_KEYS.current)); corrupt.checksum = 'bad'; backend.setItem(STORAGE_KEYS.current, JSON.stringify(corrupt)); const resolved = resolveSnapshot(backend, null); assert.equal(resolved.source, 'lastValid'); assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.current)).checksum, 'bad')
})
