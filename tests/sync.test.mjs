import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshot } from '../src/utils/snapshot.js'
import { resolveFirstSync } from '../src/domain/sync/firstSync.js'
import { createMultiTabLease } from '../src/domain/sync/multiTabLease.js'
import { activateUserSession, createLocalFinanceRepository, deactivateUserSession } from '../src/infrastructure/storage/localFinanceRepository.js'
import { MemoryStorage } from './helpers/memoryStorage.mjs'
import { createFinanceState } from './factories/financeFactory.mjs'

test('primeira sincronização nunca envia dados locais sem confirmação', () => {
  const local = createSnapshot(createFinanceState(), { revision: 1 })
  assert.equal(resolveFirstSync(local, null).action, 'confirm-upload-local')
})

test('primeira sincronização reconhece igualdade e bloqueia divergência', () => {
  const local = createSnapshot(createFinanceState(), { revision: 1 })
  const equal = createSnapshot(createFinanceState(), { revision: 8 })
  assert.equal(resolveFirstSync(local, { snapshot: equal, revision: 8 }).action, 'synchronized')
  const different = createSnapshot(createFinanceState({ categories: ['Outra'] }), { revision: 8 })
  assert.equal(resolveFirstSync(local, { snapshot: different, revision: 8 }).action, 'conflict')
})

test('cache e fila pendente são isolados por usuário', () => {
  const backend = new MemoryStorage()
  const first = createLocalFinanceRepository(backend, 'user-1')
  const second = createLocalFinanceRepository(backend, 'user-2')
  assert.equal(first.savePending({ value: 1 }).success, true)
  assert.deepEqual(first.loadPending().data, { value: 1 })
  assert.equal(second.loadPending().data, null)
})

test('lease impede duas abas de gravarem ao mesmo tempo e permite retomada após expiração', () => {
  const backend = new MemoryStorage()
  let time = 1000
  const first = createMultiTabLease(backend, 'user-1', 'tab-a', () => time)
  const second = createMultiTabLease(backend, 'user-1', 'tab-b', () => time)
  assert.equal(first.acquire(), true)
  assert.equal(second.acquire(), false)
  time += 16000
  assert.equal(second.acquire(), true)
})

test('logout copia e verifica o cache por usuário antes de limpar chaves ativas', () => {
  const backend = new MemoryStorage({ 'clareza:transactions': JSON.stringify([{ id: 't-1' }]) })
  assert.equal(deactivateUserSession(backend, 'user-1').success, true)
  assert.equal(backend.getItem('clareza:transactions'), null)
  assert.equal(activateUserSession(backend, 'user-1').success, true)
  assert.deepEqual(JSON.parse(backend.getItem('clareza:transactions')), [{ id: 't-1' }])
})

test('cache de usuários diferentes não cruza dados financeiros', () => {
  const backend = new MemoryStorage({ 'clareza:transactions': JSON.stringify([{ id: 'a' }]) })
  deactivateUserSession(backend, 'user-a')
  backend.setItem('clareza:transactions', JSON.stringify([{ id: 'b' }]))
  deactivateUserSession(backend, 'user-b')
  activateUserSession(backend, 'user-a')
  assert.equal(JSON.parse(backend.getItem('clareza:transactions'))[0].id, 'a')
})
