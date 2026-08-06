import test from 'node:test'
import assert from 'node:assert/strict'
import { mapFinanceStateToRelational } from '../src/domain/relational/relationalMapper.js'

const snapshot = (data) => ({ snapshotId: 'snap', revision: 7, checksum: 'fnv1a-test', data })
test('mapper preserva IDs, payload e valores sem reinterpretar', () => {
  const data = { accounts: [{ accountId: 'a', name: 'Conta', initialBalance: 10.25 }], cards: [{ id: 'c', name: 'Card' }], categories: ['Casa'], costCenters: ['Pessoal'], recurrences: [], invoiceRecords: [{ id: 'inv', cardId: 'c' }], transactions: [{ id: 't', amount: -10.25, accountId: 'a', category: 'Casa', invoiceId: 'inv', date: '2026-12-31', competenceMonth: 1, competenceYear: 2027 }], transfers: [] }
  const result = mapFinanceStateToRelational({ userId: 'u', snapshot: snapshot(data) })
  assert.equal(result.entities.accounts[0].id, 'a')
  assert.equal(result.entities.transactions[0].amount, -10.25)
  assert.equal(result.entities.transactions[0].competence_key, '2027-01')
  assert.deepEqual(result.entities.transactions[0].legacy_payload, data.transactions[0])
  assert.equal(result.issues.length, 0)
})

test('referência ausente fica nula e é relatada, sem alterar origem', () => {
  const data = { accounts: [], cards: [], categories: [], costCenters: [], recurrences: [], invoiceRecords: [], transactions: [{ id: 't', accountId: 'missing', amount: 1 }], transfers: [] }
  const original = structuredClone(data)
  const result = mapFinanceStateToRelational({ userId: 'u', snapshot: snapshot(data) })
  assert.equal(result.entities.transactions[0].account_id, null)
  assert.equal(result.issues[0].issue_code, 'MISSING_REFERENCE')
  assert.deepEqual(data, original)
})
