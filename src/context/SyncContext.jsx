import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { useFinance } from './FinanceContext.jsx'
import { createLocalFinanceRepository } from '../infrastructure/storage/localFinanceRepository.js'
import { createRemoteFinanceRepository } from '../infrastructure/storage/remoteFinanceRepository.js'
import { createMultiTabLease } from '../domain/sync/multiTabLease.js'
import { SYNC_ERROR_CODES } from '../domain/sync/syncErrors.js'
import { resolveFirstSync, selectBootstrapLocalData } from '../domain/sync/firstSync.js'
import { checksum, createSnapshot } from '../utils/snapshot.js'
import { getBrowserStorage } from '../utils/storage.js'

const SyncContext = createContext(null)
const ownerId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const dataFingerprint = (data) => checksum(data)
const getPendingData = (pending) => pending?.data || pending?.snapshot?.data

export function SyncProvider({ children }) {
  const auth = useAuth()
  const finance = useFinance()
  const backend = useMemo(() => getBrowserStorage(), [])
  const localRepository = useMemo(() => createLocalFinanceRepository(backend, auth.user.id), [backend, auth.user.id])
  const remoteRepository = useMemo(() => createRemoteFinanceRepository(auth.client, auth.user.id), [auth.client, auth.user.id])
  const lease = useMemo(() => createMultiTabLease(backend, auth.user.id, ownerId), [backend, auth.user.id])
  const [sync, setSync] = useState({ status: 'loading', lastSyncedAt: null, message: 'Comparando dados locais e remotos.', conflict: null })
  const [reconnectTick, setReconnectTick] = useState(0)
  const statusRef = useRef(sync.status)
  statusRef.current = sync.status
  const remoteRevisionRef = useRef(0)
  const lastSyncedFingerprintRef = useRef(null)
  const queueRef = useRef(null)
  const savingRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const bootstrapStartedRef = useRef(false)
  const channelRef = useRef(null)
  const retryTimerRef = useRef(null)
  const retryCountRef = useRef(0)
  const stateRef = useRef(finance.financeState)
  stateRef.current = finance.financeState

  const acceptRemote = useCallback((remote, localData = stateRef.current) => {
    const backup = localRepository.savePreRemoteBackup(createSnapshot(localData, { revision: 1 }))
    if (!backup.success) {
      setSync((current) => ({
        ...current,
        status: current.conflict ? 'conflict' : 'error',
        message: `A versão local não foi substituída porque a cópia de segurança falhou. ${backup.message}`,
      }))
      return false
    }
    localRepository.saveRemoteCache(remote.snapshot)
    localRepository.clearPending()
    localRepository.clearConflict()
    remoteRevisionRef.current = remote.revision
    lastSyncedFingerprintRef.current = dataFingerprint(remote.snapshot.data)
    applyingRemoteRef.current = true
    finance.replaceFinanceState(remote.snapshot.data)
    setSync({ status: 'synchronized', lastSyncedAt: remote.updatedAt || remote.snapshot.createdAt, message: null, conflict: null })
    return true
  }, [finance.replaceFinanceState, localRepository])

  const setConflict = useCallback((localSnapshot, remote) => {
    const conflict = { localSnapshot, remoteSnapshot: remote.snapshot, remoteRevision: remote.revision, detectedAt: new Date().toISOString() }
    localRepository.saveConflict(conflict)
    setSync({ status: 'conflict', lastSyncedAt: remote.updatedAt || null, message: 'Existem versões diferentes neste dispositivo e na nuvem.', conflict })
  }, [localRepository])

  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimerRef.current)
    const delay = Math.min(30000, 1000 * (2 ** retryCountRef.current))
    retryCountRef.current += 1
    retryTimerRef.current = setTimeout(() => {
      queueRef.current = stateRef.current
      void flushRef.current?.()
    }, delay)
  }, [localRepository])

  const flushRef = useRef(null)
  const flush = useCallback(async () => {
    if (savingRef.current || !queueRef.current || statusRef.current === 'conflict') return
    if (!navigator.onLine) {
      setSync((current) => ({ ...current, status: 'offline', message: 'Sem conexão. As alterações estão seguras neste dispositivo.' }))
      return
    }
    if (!lease.acquire()) {
      setSync((current) => ({ ...current, status: 'pending', message: 'Outra aba está sincronizando. Esta alteração permanece pendente.' }))
      return
    }
    savingRef.current = true
    try {
      while (queueRef.current) {
        const data = queueRef.current
        queueRef.current = null
        const expectedRevision = remoteRevisionRef.current
        const snapshot = createSnapshot(data, { revision: expectedRevision + 1 })
        localRepository.savePending({ snapshot, expectedRevision, queuedAt: new Date().toISOString() })
        setSync((current) => ({ ...current, status: 'saving', message: null }))
        const saved = expectedRevision === 0
          ? await remoteRepository.create(snapshot)
          : await remoteRepository.update(snapshot, expectedRevision)
        remoteRevisionRef.current = saved.revision
        lastSyncedFingerprintRef.current = dataFingerprint(saved.snapshot.data)
        localRepository.saveRemoteCache(saved.snapshot)
        localRepository.clearPending()
        localRepository.clearConflict()
        retryCountRef.current = 0
        setSync({ status: 'synchronized', lastSyncedAt: saved.updatedAt || saved.snapshot.createdAt, message: null, conflict: null })
        channelRef.current?.postMessage({ type: 'remote-updated', revision: saved.revision })
      }
    } catch (error) {
      if (error.code === SYNC_ERROR_CODES.CONFLICT) {
        try {
          const remote = await remoteRepository.load()
          if (remote) setConflict(createSnapshot(stateRef.current, { revision: Math.max(1, remote.revision + 1) }), remote)
        } catch (loadError) {
          setSync((current) => ({ ...current, status: 'error', message: loadError.message }))
        }
      } else {
        queueRef.current = stateRef.current
        setSync((current) => ({ ...current, status: navigator.onLine ? 'error' : 'offline', message: error.message }))
        scheduleRetry()
      }
    } finally {
      savingRef.current = false
      lease.release()
    }
  }, [lease, localRepository, remoteRepository, scheduleRetry, setConflict])
  flushRef.current = flush

  const enqueue = useCallback((data) => {
    queueRef.current = data
    localRepository.savePending({ data, expectedRevision: remoteRevisionRef.current, queuedAt: new Date().toISOString() })
    setSync((current) => ({ ...current, status: navigator.onLine ? 'pending' : 'offline', message: navigator.onLine ? 'Alterações aguardando sincronização.' : 'Sem conexão. Alterações pendentes.' }))
    void flush()
  }, [flush, localRepository])

  useEffect(() => {
    if (bootstrapStartedRef.current || (finance.hasLocalState && (finance.persistence.status === 'saving' || finance.persistence.pendingChanges))) return
    bootstrapStartedRef.current = true
    const bootstrap = async () => {
      const pending = localRepository.loadPending()
      if (!pending.success) {
        setSync({ status: 'error', lastSyncedAt: null, message: pending.message, conflict: null })
        return
      }
      const initialPendingData = getPendingData(pending.data)
      if (!finance.hasLocalState && initialPendingData) finance.replaceFinanceState(initialPendingData)
      if (!navigator.onLine) {
        const cached = localRepository.loadRemoteCache()
        if (cached.success && cached.data) remoteRevisionRef.current = cached.data.revision
        setSync({ status: 'offline', lastSyncedAt: cached.data?.createdAt || null, message: 'Sem conexão. Usando os dados locais.', conflict: null })
        return
      }
      try {
        const remote = await remoteRepository.load()
        const latestPending = localRepository.loadPending()
        if (!latestPending.success) throw new Error(latestPending.message)
        const pendingData = getPendingData(latestPending.data)
        const localData = selectBootstrapLocalData({
          currentData: stateRef.current,
          pendingData,
          hasLocalState: finance.hasLocalState,
        })
        const localSnapshot = createSnapshot(localData, { revision: 1 })
        const hasLocalState = finance.hasLocalState || Boolean(pendingData)
        const resolution = resolveFirstSync(localSnapshot, remote, { hasLocalState })
        if (resolution.action === 'confirm-upload-local') {
          if (!finance.hasLocalState && pendingData) finance.replaceFinanceState(pendingData)
          setSync({ status: 'setup-required', lastSyncedAt: null, message: 'Dados locais encontrados. Confirme o primeiro envio para a nuvem.', conflict: { localSnapshot, remoteSnapshot: null, remoteRevision: 0 } })
          return
        }
        if (resolution.action === 'hydrate-remote') {
          acceptRemote(remote)
          return
        }
        if (resolution.action === 'synchronized' && !finance.hasLocalState && pendingData) {
          acceptRemote(remote, pendingData)
          return
        }
        remoteRevisionRef.current = remote.revision
        localRepository.saveRemoteCache(remote.snapshot)
        if (resolution.action === 'synchronized') {
          localRepository.clearPending()
          localRepository.clearConflict()
          lastSyncedFingerprintRef.current = dataFingerprint(remote.snapshot.data)
          setSync({ status: 'synchronized', lastSyncedAt: remote.updatedAt || remote.snapshot.createdAt, message: null, conflict: null })
          return
        }
        if (!finance.hasLocalState && pendingData) finance.replaceFinanceState(pendingData)
        setConflict(localSnapshot, remote)
      } catch (error) {
        const cached = localRepository.loadRemoteCache()
        if (cached.success && cached.data) remoteRevisionRef.current = cached.data.revision
        setSync({ status: navigator.onLine ? 'error' : 'offline', lastSyncedAt: cached.data?.createdAt || null, message: error.message, conflict: null })
      }
    }
    void bootstrap()
  }, [acceptRemote, finance.hasLocalState, finance.persistence.pendingChanges, finance.persistence.status, localRepository, reconnectTick, remoteRepository, setConflict])

  useEffect(() => {
    if (!['synchronized', 'pending', 'saving', 'offline', 'error'].includes(sync.status)) return
    const fingerprint = dataFingerprint(finance.financeState)
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false
      lastSyncedFingerprintRef.current = fingerprint
      return
    }
    if (!lastSyncedFingerprintRef.current) {
      lastSyncedFingerprintRef.current = fingerprint
      return
    }
    if (fingerprint === lastSyncedFingerprintRef.current) return
    const timeout = setTimeout(() => enqueue(finance.financeState), 350)
    return () => clearTimeout(timeout)
  }, [enqueue, finance.financeState, sync.status])

  useEffect(() => {
    const online = () => {
      const pending = localRepository.loadPending().data
      if (queueRef.current || pending) {
        if (!queueRef.current) queueRef.current = stateRef.current
        void flush()
      } else if (remoteRevisionRef.current === 0) {
        bootstrapStartedRef.current = false
        setSync((current) => ({ ...current, status: 'loading', message: 'Conexão restaurada. Comparando dados.' }))
        setReconnectTick((value) => value + 1)
      }
    }
    const offline = () => setSync((current) => ({ ...current, status: 'offline', message: 'Sem conexão. Alterações locais continuam disponíveis.' }))
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    if ('BroadcastChannel' in globalThis) {
      const channel = new BroadcastChannel(`clareza-sync:${auth.user.id}`)
      channelRef.current = channel
      channel.onmessage = async ({ data }) => {
        if (data?.type === 'remote-updated' && data.revision > remoteRevisionRef.current) {
          try {
            const remote = await remoteRepository.load()
            if (!remote) return
            if (dataFingerprint(stateRef.current) === lastSyncedFingerprintRef.current) acceptRemote(remote)
            else setConflict(createSnapshot(stateRef.current, { revision: remote.revision + 1 }), remote)
          } catch (error) {
            setSync((current) => ({ ...current, status: 'error', message: error.message }))
          }
        }
      }
    }
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      channelRef.current?.close()
      clearTimeout(retryTimerRef.current)
    }
  }, [acceptRemote, auth.user.id, flush, localRepository, remoteRepository, setConflict])

  const uploadLocal = useCallback(async () => {
    const remoteRevision = sync.conflict?.remoteRevision || 0
    remoteRevisionRef.current = remoteRevision
    queueRef.current = stateRef.current
    statusRef.current = 'pending'
    setSync((current) => ({ ...current, status: 'pending', message: 'Envio confirmado; preparando sincronização.' }))
    await flush()
  }, [flush, sync.conflict])

  const useRemote = useCallback(() => {
    const remoteSnapshot = sync.conflict?.remoteSnapshot
    if (!remoteSnapshot) return
    acceptRemote(
      { snapshot: remoteSnapshot, revision: sync.conflict.remoteRevision, updatedAt: remoteSnapshot.createdAt },
      stateRef.current,
    )
  }, [acceptRemote, sync.conflict])

  const retry = useCallback(() => {
    const pending = localRepository.loadPending().data
    if (pending) {
      queueRef.current = stateRef.current
      void flush()
      return
    }
    bootstrapStartedRef.current = false
    setSync((current) => ({ ...current, status: 'loading', message: 'Comparando novamente os dados locais e remotos.' }))
    setReconnectTick((value) => value + 1)
  }, [flush, localRepository])

  const value = useMemo(() => ({ ...sync, uploadLocal, useRemote, retry }), [sync, uploadLocal, useRemote, retry])
  return <SyncContext.Provider value={value}>
    {sync.status === 'loading' && !finance.hasLocalState
      ? <main className="auth-screen"><section className="auth-card" role="status"><h1>Clareza</h1><p>Carregando seus dados com segurança…</p></section></main>
      : children}
  </SyncContext.Provider>
}

export const useSync = () => {
  const context = useContext(SyncContext)
  if (!context) throw new Error('useSync deve ser usado dentro de SyncProvider')
  return context
}
