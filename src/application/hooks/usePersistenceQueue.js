import { useCallback, useRef, useState } from 'react'
import { createSnapshot, stableStringify } from '../../utils/snapshot.js'
import { saveFinanceSnapshot } from '../../infrastructure/storage/financeRepository.js'

export default function usePersistenceQueue({ backend, migrationError, bootstrap, initialData }) {
  const [persistence, setPersistence] = useState(() => ({ status: bootstrap.success ? (bootstrap.recovered ? 'unsaved' : 'synced') : 'error', lastSuccessfulSaveAt: bootstrap.source === 'current' ? bootstrap.snapshot.createdAt : null, lastAttemptAt: null, pendingChanges: Boolean(bootstrap.recovered || bootstrap.needsInitialSave), errorType: bootstrap.success ? null : 'CORRUPTED_DATA', message: bootstrap.recovered ? 'Um snapshot de recuperação foi carregado e ainda não substituiu o estado principal.' : bootstrap.message, recoveredFrom: bootstrap.recovered ? bootstrap.source : null }))
  const [recoveryOverride, setRecoveryOverride] = useState(false)
  const queueRef = useRef(null); const savingRef = useRef(false); const revisionRef = useRef(bootstrap.snapshot?.revision || 0); const stateRef = useRef(null); const initialFingerprintRef = useRef(!bootstrap.needsInitialSave ? stableStringify(initialData) : null)
  const flushPersistence = useCallback(async () => {
    if (savingRef.current || !backend || migrationError) return
    savingRef.current = true
    while (queueRef.current) {
      const pending = queueRef.current; queueRef.current = null
      setPersistence((value) => ({ ...value, status: 'saving', lastAttemptAt: new Date().toISOString(), pendingChanges: true, message: null }))
      await Promise.resolve()
      const result = saveFinanceSnapshot(pending, backend)
      if (result.success) setPersistence((value) => ({ ...value, status: result.warning ? 'unsaved' : 'synced', lastSuccessfulSaveAt: pending.createdAt, pendingChanges: Boolean(result.warning), errorType: result.warning ? 'compatibility' : null, message: result.warning, recoveredFrom: null }))
      else setPersistence((value) => ({ ...value, status: 'error', pendingChanges: true, errorType: result.errorType, message: result.message }))
    }
    savingRef.current = false
  }, [backend, migrationError])
  const enqueuePersistence = useCallback((data) => {
    if ((!bootstrap.success && !recoveryOverride) || !backend) return
    revisionRef.current += 1; queueRef.current = createSnapshot(data, { revision: revisionRef.current }); void flushPersistence()
  }, [backend, bootstrap.success, flushPersistence, recoveryOverride])
  const retryPersistence = useCallback(() => { if (stateRef.current) enqueuePersistence(stateRef.current) }, [enqueuePersistence])
  return { persistence, setPersistence, recoveryOverride, setRecoveryOverride, stateRef, initialFingerprintRef, enqueuePersistence, retryPersistence }
}
