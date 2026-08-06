import test from 'node:test'
import assert from 'node:assert/strict'
import { mapFinanceStateToRelational } from '../src/domain/relational/relationalMapper.js'
import { createRelationalEquivalenceReport } from '../src/domain/relational/equivalenceService.js'

test('round-trip por legacy_payload reproduz baseline com tolerância monetária zero', () => {
  const state = { accounts: [{ accountId: 'a', name: 'Conta', initialBalance: 100, initialBalanceDate: '2026-01-01', includeInTotalBalance: true }], cards: [], categories: ['Casa'], costCenters: [], recurrences: [], invoiceRecords: [], transactions: [{ id: 't', type: 'income', status: 'received', amount: 10.25, accountId: 'a', category: 'Casa', date: '2026-01-02', competenceMonth: 1, competenceYear: 2026 }], transfers: [], alertStates: [], filters: {}, userSettings: {}, migrations: {} }
  const source = { userId: 'u', snapshotId: 's', revision: 1, checksum: 'c' }
  const mapped = mapFinanceStateToRelational({ userId: 'u', snapshot: { ...source, data: state } })
  const report = createRelationalEquivalenceReport({ legacyState: state, relationalEntities: mapped.entities, source, referenceDate: new Date(2026, 0, 15), generatedAt: '2026-01-15T12:00:00.000Z' })
  assert.equal(report.status, 'equivalent'); assert.equal(report.summary.divergentFields, 0)
  const changed = structuredClone(mapped.entities); changed.transactions[0].amount = 10.24
  const divergent = createRelationalEquivalenceReport({ legacyState: state, relationalEntities: changed, source, referenceDate: new Date(2026, 0, 15), generatedAt: '2026-01-15T12:00:00.000Z' })
  assert.equal(divergent.status, 'divergent'); assert.ok(divergent.summary.divergentFields > 0)
})
