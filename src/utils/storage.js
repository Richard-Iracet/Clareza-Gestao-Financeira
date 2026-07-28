export const STORAGE_KEYS = {
  transactions: 'clareza:transactions', categories: 'clareza:categories', cards: 'clareza:cards', accounts: 'clareza:accounts', invoices: 'clareza:invoices',
  transfers: 'clareza:transfers', recurrences: 'clareza:recurrences', alertStates: 'clareza:alertStates',
  filters: 'clareza:filters', userSettings: 'clareza:userSettings', costCenters: 'clareza:costCenters', dataVersion: 'financeDataVersion',
  current: 'clareza:finance_state_current', temp: 'clareza:finance_state_temp', lastValid: 'clareza:finance_state_last_valid',
  recovery: 'clareza:finance_state_recovery', metadata: 'clareza:finance_state_metadata',
}

export const getStorageErrorType = (error) => {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase()
  if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014 || text.includes('quota') || text.includes('storage full')) return 'QUOTA_EXCEEDED'
  if (error?.name === 'SecurityError' || text.includes('access') || text.includes('denied') || text.includes('security') || text.includes('private')) return 'STORAGE_BLOCKED'
  if (error instanceof SyntaxError || text.includes('json')) return 'DESERIALIZATION_ERROR'
  return 'UNKNOWN_STORAGE_ERROR'
}

export const storageFailure = (operation, key, error, errorType = getStorageErrorType(error)) => ({ success: false, data: null, operation, key, errorType, message: error?.message || 'Falha desconhecida no armazenamento.', error })
export const getBrowserStorage = () => { try { return globalThis.localStorage } catch { return null } }

export const readStorage = (key, fallback = null, backend = getBrowserStorage()) => {
  if (!backend) return storageFailure('read', key, new DOMException('Armazenamento indisponível.', 'SecurityError'))
  try {
    const raw = backend.getItem(key)
    if (raw === null) return { success: true, key, exists: false, data: fallback, raw: null }
    return { success: true, key, exists: true, data: JSON.parse(raw), raw }
  } catch (error) { return storageFailure('read', key, error, error instanceof SyntaxError ? 'DESERIALIZATION_ERROR' : getStorageErrorType(error)) }
}

export const writeStorage = (key, value, backend = getBrowserStorage()) => {
  if (!backend) return storageFailure('write', key, new DOMException('Armazenamento indisponível.', 'SecurityError'))
  try {
    let raw
    try { raw = JSON.stringify(value) } catch (error) { return storageFailure('write', key, error, 'SERIALIZATION_ERROR') }
    if (raw === undefined) return storageFailure('write', key, new TypeError('O valor não pode ser serializado.'), 'SERIALIZATION_ERROR')
    backend.setItem(key, raw)
    const reread = backend.getItem(key)
    let equivalent = false
    try { equivalent = JSON.stringify(JSON.parse(reread)) === JSON.stringify(JSON.parse(raw)) } catch { equivalent = false }
    if (!equivalent) return storageFailure('verify', key, new Error('A verificação após a gravação falhou.'), 'WRITE_VERIFICATION_ERROR')
    return { success: true, data: value, error: null, errorType: null, message: 'Dados salvos e verificados.', key, bytes: raw.length }
  } catch (error) { return storageFailure('write', key, error) }
}

export const removeStorage = (key, backend = getBrowserStorage()) => {
  if (!backend) return storageFailure('remove', key, new DOMException('Armazenamento indisponível.', 'SecurityError'))
  try { backend.removeItem(key); return { success: backend.getItem(key) === null, key } } catch (error) { return storageFailure('remove', key, error) }
}

export const hasStorageKey = (key, backend = getBrowserStorage()) => { const result = readStorage(key, null, backend); return result.success ? { ...result, data: result.exists } : result }
export const testStorageAvailability = (backend = getBrowserStorage()) => {
  const key = `clareza:storage_test:${Date.now()}`; const written = writeStorage(key, { ok: true }, backend)
  if (!written.success) return written
  const removed = removeStorage(key, backend); return removed.success ? { success: true, data: true, error: null, errorType: null, message: 'Armazenamento disponível.' } : removed
}
export const verifyStorageWrite = (key, expected, backend = getBrowserStorage()) => {
  const result = readStorage(key, null, backend)
  if (!result.success) return result
  if (JSON.stringify(result.data) !== JSON.stringify(expected)) return storageFailure('verify', key, new Error('Conteúdo divergente.'), 'WRITE_VERIFICATION_ERROR')
  return { success: true, data: result.data, error: null, errorType: null, message: 'Gravação verificada.', key }
}

const legacyRead = (key, fallback) => { const result = readStorage(key, fallback); return result.success ? result.data : fallback }
const legacyWrite = (key, value) => writeStorage(key, value)

export const storage = {
  getTransactions: (fallback = []) => legacyRead(STORAGE_KEYS.transactions, fallback), saveTransactions: (value) => legacyWrite(STORAGE_KEYS.transactions, value),
  getCategories: (fallback = []) => legacyRead(STORAGE_KEYS.categories, fallback), saveCategories: (value) => legacyWrite(STORAGE_KEYS.categories, value),
  getCards: (fallback = []) => legacyRead(STORAGE_KEYS.cards, fallback), saveCards: (value) => legacyWrite(STORAGE_KEYS.cards, value),
  getAccounts: (fallback = []) => legacyRead(STORAGE_KEYS.accounts, fallback), saveAccounts: (value) => legacyWrite(STORAGE_KEYS.accounts, value),
  getTransfers: (fallback = []) => legacyRead(STORAGE_KEYS.transfers, fallback), saveTransfers: (value) => legacyWrite(STORAGE_KEYS.transfers, value),
  getRecurrences: (fallback = []) => legacyRead(STORAGE_KEYS.recurrences, fallback), saveRecurrences: (value) => legacyWrite(STORAGE_KEYS.recurrences, value),
  getAlertStates: (fallback = []) => legacyRead(STORAGE_KEYS.alertStates, fallback), saveAlertStates: (value) => legacyWrite(STORAGE_KEYS.alertStates, value),
  getInvoicePayments: (fallback = []) => legacyRead(STORAGE_KEYS.invoices, fallback), saveInvoicePayments: (value) => legacyWrite(STORAGE_KEYS.invoices, value),
  getDataVersion: () => legacyRead(STORAGE_KEYS.dataVersion, 0), saveDataVersion: (value) => legacyWrite(STORAGE_KEYS.dataVersion, value),
  getMigrationBackup: () => legacyRead('financeDataBackupBeforeInvoiceMigration', null), saveMigrationBackup: (value) => legacyWrite('financeDataBackupBeforeInvoiceMigration', value),
  getInstallmentMigrationBackup: () => legacyRead('financeDataBackupBeforeInstallmentProjectionV4', null),
}
