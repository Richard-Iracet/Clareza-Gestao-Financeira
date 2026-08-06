import { costCenters as defaultCostCenters } from '../data/settings.js'
import { BACKUP_FORMAT_VERSION, validateBackup } from './dataValidation.js'
import { createSnapshot, persistSnapshot, readSnapshotCandidate } from './snapshot.js'
import { STORAGE_KEYS, writeStorage } from './storage.js'
import { getAppMetadata } from '../config/appMetadata.js'

export const FINANCE_STORAGE_KEYS = [STORAGE_KEYS.transactions, STORAGE_KEYS.categories, STORAGE_KEYS.cards, STORAGE_KEYS.accounts, STORAGE_KEYS.transfers, STORAGE_KEYS.recurrences, STORAGE_KEYS.alertStates, STORAGE_KEYS.invoices, STORAGE_KEYS.filters, STORAGE_KEYS.userSettings, STORAGE_KEYS.costCenters, STORAGE_KEYS.dataVersion, 'financeDataBackupBeforeInvoiceMigration', 'financeDataBackupBeforeInstallmentProjectionV4']
export const SNAPSHOT_STORAGE_KEYS = [STORAGE_KEYS.current, STORAGE_KEYS.temp, STORAGE_KEYS.lastValid, STORAGE_KEYS.recovery, STORAGE_KEYS.metadata]
export const INTERNAL_IMPORT_BACKUP_KEY = 'financeDataBackupBeforeManualImport'
const EXPORT_STORAGE_KEYS = [...FINANCE_STORAGE_KEYS, ...SNAPSHOT_STORAGE_KEYS, INTERNAL_IMPORT_BACKUP_KEY]
const parseStoredValue = (raw) => {
  if (raw === null) return null
  try { return JSON.parse(raw) } catch { return { __rawValue: raw, __parseError: true } }
}

export const readFinanceStorage = (backend) => {
  const values = {}
  const errors = []
  EXPORT_STORAGE_KEYS.forEach((key) => {
    try {
      const parsed = parseStoredValue(backend.getItem(key))
      values[key] = parsed
      if (parsed?.__parseError) errors.push(`A chave ${key} cont\u00e9m JSON inv\u00e1lido.`)
    } catch (error) {
      values[key] = null
      errors.push(`N\u00e3o foi poss\u00edvel ler ${key}: ${error.message}`)
    }
  })
  return { values, errors }
}

const countInvoices = (transactions, records) => new Set([
  ...transactions.map((item) => item.invoiceId).filter(Boolean),
  ...records.map((item) => item.id).filter(Boolean),
]).size

const validVersion = (value, fallback = 4) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback

export const createBackup = (backend, runtime = {}) => {
  const stored = readFinanceStorage(backend)
  if (stored.errors.length) throw new Error(stored.errors.join(' '))
  const current = readSnapshotCandidate(STORAGE_KEYS.current, backend)
  const transactions = runtime.transactions ?? stored.values[STORAGE_KEYS.transactions] ?? []
  const cards = runtime.cards ?? stored.values[STORAGE_KEYS.cards] ?? []
  const accounts = runtime.accounts ?? stored.values[STORAGE_KEYS.accounts] ?? []
  const transfers = runtime.transfers ?? stored.values[STORAGE_KEYS.transfers] ?? []
  const recurrences = runtime.recurrences ?? stored.values[STORAGE_KEYS.recurrences] ?? []
  const alertStates = runtime.alertStates ?? stored.values[STORAGE_KEYS.alertStates] ?? []
  const categories = runtime.categories ?? stored.values[STORAGE_KEYS.categories] ?? []
  const invoiceRecords = runtime.invoicePayments ?? stored.values[STORAGE_KEYS.invoices] ?? []
  const savedFilters = runtime.filters ?? stored.values[STORAGE_KEYS.filters] ?? {}
  const userSettings = runtime.userSettings ?? stored.values[STORAGE_KEYS.userSettings] ?? {}
  const costCenters = runtime.costCenters ?? stored.values[STORAGE_KEYS.costCenters] ?? defaultCostCenters
  const financeDataVersion = validVersion(stored.values[STORAGE_KEYS.dataVersion], validVersion(current.data?.financeDataVersion, 4))
  const migrations = runtime.migrations ?? current.data?.data?.migrations ?? { financeDataVersion }
  const snapshotData = {
    transactions,
    cards,
    accounts: Array.isArray(accounts) ? accounts : [],
    transfers: Array.isArray(transfers) ? transfers : [],
    recurrences: Array.isArray(recurrences) ? recurrences : [],
    alertStates: Array.isArray(alertStates) ? alertStates : [],
    categories,
    costCenters,
    invoiceRecords,
    filters: savedFilters,
    userSettings,
    migrations,
  }
  const storageValues = {
    ...stored.values,
    [STORAGE_KEYS.transactions]: transactions,
    [STORAGE_KEYS.cards]: cards,
    [STORAGE_KEYS.accounts]: snapshotData.accounts,
    [STORAGE_KEYS.transfers]: snapshotData.transfers,
    [STORAGE_KEYS.recurrences]: snapshotData.recurrences,
    [STORAGE_KEYS.alertStates]: snapshotData.alertStates,
    [STORAGE_KEYS.categories]: categories,
    [STORAGE_KEYS.invoices]: invoiceRecords,
    [STORAGE_KEYS.filters]: savedFilters,
    [STORAGE_KEYS.userSettings]: userSettings,
    [STORAGE_KEYS.costCenters]: costCenters,
    [STORAGE_KEYS.dataVersion]: financeDataVersion,
  }
  const counts = {
    transactions: transactions.length,
    invoices: countInvoices(transactions, invoiceRecords),
    cards: cards.length,
    accounts: snapshotData.accounts.length,
    transfers: snapshotData.transfers.length,
    recurrences: snapshotData.recurrences.length,
    alertStates: snapshotData.alertStates.length,
    categories: categories.length,
    installments: transactions.filter((item) => Number(item.installmentTotal) > 1).length,
  }
  const snapshot = createSnapshot(snapshotData, {
    financeDataVersion,
    revision: Math.max(1, Number(current.data?.revision || 0) + 1),
  })
  const appMetadata = getAppMetadata(runtime.environment)
  return {
    format: 'clareza-finance-backup',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: { application: 'Clareza Financeira', financeDataVersion, locale: 'pt-BR', counts, appMetadata },
    data: { transactions, cards, accounts: snapshotData.accounts, transfers: snapshotData.transfers, recurrences: snapshotData.recurrences, alertStates: snapshotData.alertStates, categories, costCenters, invoiceRecords, savedFilters, userSettings, migrations },
    storage: storageValues,
    snapshot,
  }
}

export const getBackupSummary = (backup) => ({
  transactions: backup.data.transactions.length,
  invoices: backup.metadata.counts.invoices,
  cards: backup.data.cards.length,
  accounts: backup.data.accounts?.length || 0,
  transfers: backup.data.transfers?.length || 0,
  recurrences: backup.data.recurrences?.length || 0,
  alertStates: backup.data.alertStates?.length || 0,
  exportedAt: backup.exportedAt,
  version: backup.version,
  financeDataVersion: backup.metadata.financeDataVersion,
})

export const downloadBackup = (backup, documentObject = document, urlObject = URL) => {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = urlObject.createObjectURL(blob)
  const link = documentObject.createElement('a')
  link.href = url
  link.download = `clareza-backup-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  urlObject.revokeObjectURL(url)
}

export const downloadRawStorage = (backend, documentObject = document, urlObject = URL) => {
  const raw = {}
  try {
    for (let index = 0; index < backend.length; index += 1) {
      const key = backend.key(index)
      if (key) raw[key] = backend.getItem(key)
    }
  } catch (error) {
    raw.__readError = error.message
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), raw }, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = urlObject.createObjectURL(blob)
  const link = documentObject.createElement('a')
  link.href = url
  link.download = `clareza-dados-brutos-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  urlObject.revokeObjectURL(url)
}

export const importBackup = (backup, backend) => {
  const validation = validateBackup(backup)
  if (!validation.valid) throw new Error(validation.errors.join(' '))
  const current = readFinanceStorage(backend)
  if (current.errors.length) throw new Error(`Os dados atuais n\u00e3o puderam ser protegidos: ${current.errors.join(' ')}`)
  const allKeys = [...new Set([...FINANCE_STORAGE_KEYS, ...SNAPSHOT_STORAGE_KEYS, INTERNAL_IMPORT_BACKUP_KEY])]
  const previousRaw = Object.fromEntries(allKeys.map((key) => {
    try { return [key, backend.getItem(key)] } catch { return [key, null] }
  }))
  const safetyBackup = {
    createdAt: new Date().toISOString(),
    reason: 'before-manual-import',
    storage: Object.fromEntries(FINANCE_STORAGE_KEYS.map((key) => [key, current.values[key]])),
    snapshot: current.values[STORAGE_KEYS.current],
  }
  try {
    const protectedResult = writeStorage(INTERNAL_IMPORT_BACKUP_KEY, safetyBackup, backend)
    if (!protectedResult.success) throw new Error(`N\u00e3o foi poss\u00edvel criar o backup interno: ${protectedResult.message}`)
    const prior = readSnapshotCandidate(STORAGE_KEYS.current, backend)
    const data = backup.data
    const imported = createSnapshot({
      transactions: data.transactions,
      cards: data.cards,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      transfers: Array.isArray(data.transfers) ? data.transfers : [],
      recurrences: Array.isArray(data.recurrences) ? data.recurrences : [],
      alertStates: Array.isArray(data.alertStates) ? data.alertStates : [],
      categories: data.categories,
      costCenters: data.costCenters,
      invoiceRecords: data.invoiceRecords,
      filters: data.savedFilters || {},
      userSettings: data.userSettings || {},
      migrations: data.migrations || backup.snapshot?.data?.migrations || { financeDataVersion: backup.metadata.financeDataVersion },
    }, {
      financeDataVersion: backup.metadata.financeDataVersion,
      revision: Math.max(1, Number(prior.data?.revision || 0) + 1),
    })
    const result = persistSnapshot(imported, backend)
    if (!result.success) throw new Error(result.message)
    return { success: true, safetyBackupCreated: true, snapshotId: imported.snapshotId, warning: result.warning || null }
  } catch (error) {
    Object.entries(previousRaw).forEach(([key, raw]) => {
      try {
        if (raw === null) backend.removeItem(key)
        else backend.setItem(key, raw)
      } catch { /* best effort rollback */ }
    })
    throw new Error(`Importa\u00e7\u00e3o cancelada e dados anteriores restaurados. ${error.message}`)
  }
}
