import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, importBackup } from '../src/utils/backup.js'
import { createSnapshot } from '../src/utils/snapshot.js'
import { resolveFirstSync, selectBootstrapLocalData } from '../src/domain/sync/firstSync.js'
import { createMultiTabLease } from '../src/domain/sync/multiTabLease.js'
import { loadFinanceState, saveFinanceSnapshot } from '../src/infrastructure/storage/financeRepository.js'
import { activateUserSession, createLocalFinanceRepository, deactivateUserSession, getUserCacheKeys, SESSION_FINANCE_KEYS } from '../src/infrastructure/storage/localFinanceRepository.js'
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

test('primeira sincronização hidrata o remoto somente quando não existe estado local', () => {
  const local = createSnapshot(createFinanceState({ transactions: [], cards: [], categories: [] }), { revision: 1 })
  const remote = { snapshot: createSnapshot(createFinanceState(), { revision: 8 }), revision: 8 }
  assert.equal(resolveFirstSync(local, remote, { hasLocalState: false }).action, 'hydrate-remote')
  assert.equal(resolveFirstSync(local, remote, { hasLocalState: true }).action, 'conflict')
})

test('estado local atual prevalece sobre fila pendente antiga durante o bootstrap', () => {
  const pendingData = createFinanceState({ transactions: [{ id: 'pending-antigo' }] })
  const currentData = createFinanceState({ transactions: [{ id: 'backup-importado' }] })
  const selected = selectBootstrapLocalData({ currentData, pendingData, hasLocalState: true })
  const remote = { snapshot: createSnapshot(pendingData, { revision: 8 }), revision: 8 }

  assert.equal(selected.transactions[0].id, 'backup-importado')
  assert.equal(resolveFirstSync(createSnapshot(selected, { revision: 1 }), remote, { hasLocalState: true }).action, 'conflict')
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

test('troca A para B e retorno a A preservam caches com marcador ativo', () => {
  const backend = new MemoryStorage({ 'clareza:transactions': JSON.stringify([{ id: 'a' }]) })
  assert.equal(activateUserSession(backend, 'user-a').success, true)
  assert.equal(activateUserSession(backend, 'user-b').success, true)
  backend.setItem('clareza:transactions', JSON.stringify([{ id: 'b' }]))

  assert.equal(activateUserSession(backend, 'user-a').success, true)
  assert.equal(JSON.parse(backend.getItem('clareza:transactions'))[0].id, 'a')
  assert.equal(activateUserSession(backend, 'user-b').success, true)
  assert.equal(JSON.parse(backend.getItem('clareza:transactions'))[0].id, 'b')
})

test('recarregar a sessão do mesmo usuário não restaura uma fotografia obsoleta', () => {
  const backend = new MemoryStorage()
  const firstActivation = activateUserSession(backend, 'user-1')
  assert.equal(firstActivation.hasLocalState, false)
  const state = createFinanceState()
  assert.equal(saveFinanceSnapshot(createSnapshot(state, { revision: 2 }), backend).success, true)
  const beforeReload = loadFinanceState(backend, null).snapshot

  const reactivated = activateUserSession(backend, 'user-1')
  const afterReload = loadFinanceState(backend, null).snapshot
  assert.equal(reactivated.source, 'active-session')
  assert.equal(reactivated.hasLocalState, true)
  assert.equal(afterReload.snapshotId, beforeReload.snapshotId)
  assert.deepEqual(afterReload.data, beforeReload.data)
})

test('migração preserva o estado ativo ao encontrar cache antigo sem marcador de usuário', () => {
  const backend = new MemoryStorage()
  const state = createFinanceState()
  saveFinanceSnapshot(createSnapshot(state, { revision: 3 }), backend)
  const currentBeforeActivation = loadFinanceState(backend, null).snapshot
  const staleValues = Object.fromEntries(SESSION_FINANCE_KEYS.map((key) => [key, null]))
  backend.setItem(getUserCacheKeys('user-1').session, JSON.stringify({ savedAt: '2026-01-01T00:00:00.000Z', values: staleValues }))

  const activation = activateUserSession(backend, 'user-1')
  const currentAfterActivation = loadFinanceState(backend, null).snapshot
  assert.equal(activation.source, 'active-session-migrated')
  assert.equal(currentAfterActivation.snapshotId, currentBeforeActivation.snapshotId)
  assert.deepEqual(currentAfterActivation.data, currentBeforeActivation.data)
})

test('sessão marcada recupera o cache verificado após limpeza parcial das chaves ativas', () => {
  const backend = new MemoryStorage({ 'clareza:transactions': JSON.stringify([{ id: 'recover' }]) })
  deactivateUserSession(backend, 'user-1')
  activateUserSession(backend, 'user-1')
  SESSION_FINANCE_KEYS.forEach((key) => backend.removeItem(key))

  const recovered = activateUserSession(backend, 'user-1')
  assert.equal(recovered.source, 'active-session-recovered')
  assert.deepEqual(JSON.parse(backend.getItem('clareza:transactions')), [{ id: 'recover' }])
})

test('snapshot legado usado como backup de sessão é migrado para chave de recuperação', () => {
  const backend = new MemoryStorage()
  const snapshot = createSnapshot(createFinanceState(), { revision: 3 })
  const keys = getUserCacheKeys('user-1')
  backend.setItem(keys.session, JSON.stringify(snapshot))

  assert.equal(activateUserSession(backend, 'user-1').success, true)
  assert.equal(JSON.parse(backend.getItem(keys.recovery)).snapshot.snapshotId, snapshot.snapshotId)
  assert.ok(JSON.parse(backend.getItem(keys.session)).values)
})

test('backup importado permanece íntegro após reload da sessão autenticada', () => {
  const backend = new MemoryStorage()
  const source = new MemoryStorage()
  activateUserSession(backend, 'user-1')

  const importedState = createFinanceState()
  saveFinanceSnapshot(createSnapshot(importedState, { revision: 4 }), source)
  const backup = createBackup(source, { ...importedState, invoicePayments: importedState.invoiceRecords })
  assert.equal(importBackup(backup, backend).success, true)
  const imported = loadFinanceState(backend, null).snapshot

  activateUserSession(backend, 'user-1')
  const reloaded = loadFinanceState(backend, null).snapshot
  assert.equal(reloaded.snapshotId, imported.snapshotId)
  assert.deepEqual(reloaded.data.transactions, importedState.transactions)
})

test('backup pré-substituição remota não reutiliza o contrato do cache de sessão', () => {
  const backend = new MemoryStorage()
  const repository = createLocalFinanceRepository(backend, 'user-1')
  const snapshot = createSnapshot(createFinanceState(), { revision: 2 })
  assert.equal(repository.savePreRemoteBackup(snapshot).success, true)
  const keys = getUserCacheKeys('user-1')
  assert.equal(backend.getItem(keys.session), null)
  assert.equal(JSON.parse(backend.getItem(keys.recovery)).snapshot.snapshotId, snapshot.snapshotId)
})
