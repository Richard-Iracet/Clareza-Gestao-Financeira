import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage.js'

const prefix = (userId) => `clareza:user:${userId}`
export const ACTIVE_USER_STORAGE_KEY = 'clareza:active_user'
export const getUserCacheKeys = (userId) => ({
  remote: `${prefix(userId)}:remote_snapshot`,
  pending: `${prefix(userId)}:pending_sync`,
  conflict: `${prefix(userId)}:conflict`,
  session: `${prefix(userId)}:session_backup`,
  recovery: `${prefix(userId)}:before_remote_replace`,
})

export const createLocalFinanceRepository = (backend, userId) => {
  const keys = getUserCacheKeys(userId)
  return {
    loadRemoteCache: () => readStorage(keys.remote, null, backend),
    saveRemoteCache: (snapshot) => writeStorage(keys.remote, snapshot, backend),
    loadPending: () => readStorage(keys.pending, null, backend),
    savePending: (pending) => writeStorage(keys.pending, pending, backend),
    clearPending: () => removeStorage(keys.pending, backend),
    saveConflict: (conflict) => writeStorage(keys.conflict, conflict, backend),
    clearConflict: () => removeStorage(keys.conflict, backend),
    savePreRemoteBackup: (snapshot) => writeStorage(keys.recovery, { savedAt: new Date().toISOString(), snapshot }, backend),
  }
}

export const SESSION_FINANCE_KEYS = [
  STORAGE_KEYS.transactions, STORAGE_KEYS.categories, STORAGE_KEYS.cards, STORAGE_KEYS.accounts,
  STORAGE_KEYS.invoices, STORAGE_KEYS.transfers, STORAGE_KEYS.recurrences, STORAGE_KEYS.alertStates,
  STORAGE_KEYS.filters, STORAGE_KEYS.userSettings, STORAGE_KEYS.costCenters, STORAGE_KEYS.dataVersion,
  STORAGE_KEYS.current, STORAGE_KEYS.temp, STORAGE_KEYS.lastValid, STORAGE_KEYS.recovery, STORAGE_KEYS.metadata,
  'financeDataBackupBeforeInvoiceMigration', 'financeDataBackupBeforeInstallmentProjectionV4',
  'financeDataBackupBeforeManualImport',
]

const readRawSession = (backend) => Object.fromEntries(SESSION_FINANCE_KEYS.map((key) => [key, backend.getItem(key)]))
const LOCAL_STATE_KEYS = [
  STORAGE_KEYS.current, STORAGE_KEYS.temp, STORAGE_KEYS.lastValid,
  STORAGE_KEYS.transactions, STORAGE_KEYS.categories, STORAGE_KEYS.cards, STORAGE_KEYS.accounts,
  STORAGE_KEYS.invoices, STORAGE_KEYS.transfers, STORAGE_KEYS.recurrences, STORAGE_KEYS.alertStates,
]
const hasLocalState = (values) => LOCAL_STATE_KEYS.some((key) => values?.[key] !== null && values?.[key] !== undefined)
const hasSessionValues = (values) => SESSION_FINANCE_KEYS.some((key) => values?.[key] !== null && values?.[key] !== undefined)
const restoreRawSession = (backend, values) => {
  SESSION_FINANCE_KEYS.forEach((key) => {
    if (values?.[key] === null || values?.[key] === undefined) backend.removeItem(key)
    else backend.setItem(key, values[key])
  })
}

const preserveLegacySessionSnapshot = (backend, userId, scopedData) => {
  if (scopedData?.values || !scopedData?.snapshotId || !scopedData?.data) return { success: true }
  const recoveryKey = getUserCacheKeys(userId).recovery
  const recovery = readStorage(recoveryKey, null, backend)
  if (!recovery.success || recovery.exists) return recovery.success ? { success: true } : recovery
  return writeStorage(recoveryKey, {
    savedAt: new Date().toISOString(),
    migratedFrom: 'legacy-session-backup',
    snapshot: scopedData,
  }, backend)
}

export const deactivateUserSession = (backend, userId) => {
  if (!backend || !userId) return { success: false, message: 'Armazenamento ou usuário indisponível.' }
  const active = readStorage(ACTIVE_USER_STORAGE_KEY, null, backend)
  if (!active.success) return active
  const values = readRawSession(backend)
  if (active.exists && active.data !== userId) return { success: true, source: 'inactive-user' }
  if (!active.exists && !hasSessionValues(values)) return { success: true, source: 'already-deactivated' }
  const saved = writeStorage(getUserCacheKeys(userId).session, { savedAt: new Date().toISOString(), values }, backend)
  if (!saved.success) return saved
  SESSION_FINANCE_KEYS.forEach((key) => backend.removeItem(key))
  const released = removeStorage(ACTIVE_USER_STORAGE_KEY, backend)
  if (!released.success) return released
  return { success: true }
}

export const activateUserSession = (backend, userId) => {
  if (!backend || !userId) return { success: false, message: 'Armazenamento ou usuário indisponível.' }
  const active = readStorage(ACTIVE_USER_STORAGE_KEY, null, backend)
  if (!active.success) return active
  const activeValues = readRawSession(backend)
  if (active.data === userId) {
    if (hasLocalState(activeValues)) return { success: true, source: 'active-session', hasLocalState: true }
    const scoped = readStorage(getUserCacheKeys(userId).session, null, backend)
    if (!scoped.success) return scoped
    const preserved = preserveLegacySessionSnapshot(backend, userId, scoped.data)
    if (!preserved.success) return preserved
    if (scoped.data?.values && hasLocalState(scoped.data.values)) {
      try {
        restoreRawSession(backend, scoped.data.values)
        return { success: true, source: 'active-session-recovered', hasLocalState: true }
      } catch (error) {
        return { success: false, message: `Não foi possível recuperar o cache ativo do usuário: ${error.message}`, error }
      }
    }
    return { success: true, source: 'active-session', hasLocalState: false }
  }
  if (active.data && active.data !== userId) {
    const deactivated = deactivateUserSession(backend, active.data)
    if (!deactivated.success) return deactivated
  }

  const key = getUserCacheKeys(userId).session
  const scoped = readStorage(key, null, backend)
  if (!scoped.success) return scoped
  const preserved = preserveLegacySessionSnapshot(backend, userId, scoped.data)
  if (!preserved.success) return preserved
  const previous = readRawSession(backend)

  // Migração segura da versão anterior, que ainda não registrava o proprietário
  // das chaves ativas. Uma sessão Supabase restaurada já pertence a este usuário.
  if (!active.exists && hasLocalState(previous)) {
    const claimed = writeStorage(key, { savedAt: new Date().toISOString(), values: previous, claimedActiveSession: true }, backend)
    if (!claimed.success) return claimed
    const marked = writeStorage(ACTIVE_USER_STORAGE_KEY, userId, backend)
    return marked.success ? { success: true, source: 'active-session-migrated', hasLocalState: true } : marked
  }

  let source
  let restoredValues
  if (!scoped.data?.values) {
    restoredValues = previous
    const claimed = writeStorage(key, { savedAt: new Date().toISOString(), values: restoredValues, claimedLegacy: true }, backend)
    if (!claimed.success) return claimed
    source = 'legacy'
  } else {
    try {
      restoreRawSession(backend, scoped.data.values)
      restoredValues = scoped.data.values
      source = 'user-cache'
    } catch (error) {
      try { restoreRawSession(backend, previous) } catch { /* preservação best effort */ }
      return { success: false, message: `Não foi possível restaurar o cache do usuário: ${error.message}`, error }
    }
  }

  const marked = writeStorage(ACTIVE_USER_STORAGE_KEY, userId, backend)
  if (!marked.success) {
    if (source === 'user-cache') {
      try { restoreRawSession(backend, previous) } catch { /* preservação best effort */ }
    }
    return marked
  }
  return { success: true, source, hasLocalState: hasLocalState(restoredValues) }
}
