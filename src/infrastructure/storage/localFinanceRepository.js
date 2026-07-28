import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage.js'

const prefix = (userId) => `clareza:user:${userId}`
export const getUserCacheKeys = (userId) => ({
  remote: `${prefix(userId)}:remote_snapshot`,
  pending: `${prefix(userId)}:pending_sync`,
  conflict: `${prefix(userId)}:conflict`,
  session: `${prefix(userId)}:session_backup`,
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
    saveSessionBackup: (snapshot) => writeStorage(keys.session, snapshot, backend),
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
const restoreRawSession = (backend, values) => {
  SESSION_FINANCE_KEYS.forEach((key) => {
    if (values?.[key] === null || values?.[key] === undefined) backend.removeItem(key)
    else backend.setItem(key, values[key])
  })
}

export const deactivateUserSession = (backend, userId) => {
  if (!backend || !userId) return { success: false, message: 'Armazenamento ou usuário indisponível.' }
  const values = readRawSession(backend)
  const saved = writeStorage(getUserCacheKeys(userId).session, { savedAt: new Date().toISOString(), values }, backend)
  if (!saved.success) return saved
  SESSION_FINANCE_KEYS.forEach((key) => backend.removeItem(key))
  return { success: true }
}

export const activateUserSession = (backend, userId) => {
  if (!backend || !userId) return { success: false, message: 'Armazenamento ou usuário indisponível.' }
  const key = getUserCacheKeys(userId).session
  const scoped = readStorage(key, null, backend)
  if (!scoped.success) return scoped
  if (!scoped.data?.values) {
    const claimed = writeStorage(key, { savedAt: new Date().toISOString(), values: readRawSession(backend), claimedLegacy: true }, backend)
    return claimed.success ? { success: true, source: 'legacy' } : claimed
  }
  const previous = readRawSession(backend)
  try {
    restoreRawSession(backend, scoped.data.values)
    return { success: true, source: 'user-cache' }
  } catch (error) {
    try { restoreRawSession(backend, previous) } catch { /* preservação best effort */ }
    return { success: false, message: `Não foi possível restaurar o cache do usuário: ${error.message}`, error }
  }
}
