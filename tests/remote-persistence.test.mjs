import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshot } from '../src/utils/snapshot.js'
import { createRemoteFinanceRepository, validateRemoteSnapshot } from '../src/infrastructure/storage/remoteFinanceRepository.js'
import { SYNC_ERROR_CODES } from '../src/domain/sync/syncErrors.js'
import { createFinanceState } from './factories/financeFactory.mjs'

const rowFor = (snapshot) => ({ user_id: 'user-1', data: snapshot, revision: snapshot.revision, schema_version: snapshot.schemaVersion, checksum: snapshot.checksum, created_at: snapshot.createdAt, updated_at: snapshot.createdAt })

test('estado remoto exige correspondência entre snapshot e metadados', () => {
  const snapshot = createSnapshot(createFinanceState(), { revision: 3 })
  assert.equal(validateRemoteSnapshot(rowFor(snapshot)).revision, 3)
  assert.throws(() => validateRemoteSnapshot({ ...rowFor(snapshot), revision: 4 }), (error) => error.code === SYNC_ERROR_CODES.VALIDATION)
})

test('update remoto usa RPC atômica e revisão esperada', async () => {
  const snapshot = createSnapshot(createFinanceState(), { revision: 2 })
  let call
  const client = { rpc: (name, args) => {
    call = { name, args }
    return { abortSignal: async () => ({ data: [rowFor(snapshot)], error: null }) }
  } }
  const result = await createRemoteFinanceRepository(client, 'user-1').update(snapshot, 1)
  assert.equal(result.revision, 2)
  assert.equal(call.name, 'update_finance_state')
  assert.equal(call.args.expected_revision, 1)
})

test('update remoto distingue conflito sem sobrescrever', async () => {
  const snapshot = createSnapshot(createFinanceState(), { revision: 2 })
  const client = { rpc: () => ({ abortSignal: async () => ({ data: [], error: null }) }) }
  await assert.rejects(createRemoteFinanceRepository(client, 'user-1').update(snapshot, 1), (error) => error.code === SYNC_ERROR_CODES.CONFLICT)
})

test('repositório rejeita snapshot antes de chamar a rede', async () => {
  let called = false
  const client = { rpc: () => { called = true } }
  await assert.rejects(createRemoteFinanceRepository(client, 'user-1').update({ revision: 2 }, 1), (error) => error.code === SYNC_ERROR_CODES.VALIDATION)
  assert.equal(called, false)
})
