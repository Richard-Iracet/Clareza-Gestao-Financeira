import { CURRENT_FINANCE_DATA_VERSION } from './dataValidation.js'
import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from './storage.js'

export const SNAPSHOT_SCHEMA_VERSION = 1
export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? '1.0.0' : __APP_VERSION__

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  return value
}
export const stableStringify = (value) => JSON.stringify(stable(value))
export const estimateSnapshotSize = (snapshot) => new Blob([stableStringify(snapshot)]).size
export const checksum = (value) => {
  const text = stableStringify(value); let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const arrays = ['transactions', 'cards', 'categories', 'invoiceRecords', 'costCenters']
// New collections remain optional at the schema boundary so snapshots produced before
// their introduction are still recoverable without an unsafe migration.
const optionalArrays = ['accounts', 'transfers', 'recurrences', 'alertStates']

export const createSnapshot = (data, options = {}) => {
  const base = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION, appVersion: APP_VERSION, financeDataVersion: Number(options.financeDataVersion ?? CURRENT_FINANCE_DATA_VERSION),
    snapshotVersion: 1, snapshotId: identifier(), revision: Number(options.revision || 1), createdAt: options.createdAt || new Date().toISOString(), state: 'complete',
    data: { transactions: [], cards: [], accounts: [], transfers: [], recurrences: [], alertStates: [], categories: [], invoiceRecords: [], costCenters: [], filters: {}, userSettings: {}, migrations: {}, ...data },
  }
  const core = { ...base, metadata: { counts: Object.fromEntries([...arrays, ...optionalArrays].map((key) => [key, base.data[key]?.length || 0])) } }
  return { ...core, checksum: checksum(core) }
}

export const validateSnapshot = (snapshot) => {
  const errors = []
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { valid: false, errors: ['Snapshot ausente ou inválido.'] }
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) errors.push(`Schema incompatível: ${snapshot.schemaVersion}.`)
  if (snapshot.state !== 'complete') errors.push('Snapshot não está marcado como completo.')
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) errors.push('Revisão inválida.')
  if (Number.isNaN(Date.parse(snapshot.createdAt))) errors.push('Data do snapshot inválida.')
  if (!snapshot.data || typeof snapshot.data !== 'object') errors.push('Dados do snapshot ausentes.')
  arrays.forEach((key) => { if (!Array.isArray(snapshot.data?.[key])) errors.push(`${key} deve ser uma lista.`) })
  arrays.forEach((key) => { if (Array.isArray(snapshot.data?.[key]) && snapshot.metadata?.counts?.[key] !== snapshot.data[key].length) errors.push(`Contagem de ${key} não confere.`) })
  optionalArrays.forEach((key) => { if (snapshot.data?.[key] !== undefined && !Array.isArray(snapshot.data[key])) errors.push(`${key} deve ser uma lista quando informado.`) })
  optionalArrays.forEach((key) => { if (Array.isArray(snapshot.data?.[key]) && snapshot.metadata?.counts?.[key] !== snapshot.data[key].length) errors.push(`Contagem de ${key} não confere.`) })
  if (!Number.isInteger(Number(snapshot.financeDataVersion)) || Number(snapshot.financeDataVersion) > CURRENT_FINANCE_DATA_VERSION) errors.push('Versão financeira incompatível.')
  const { checksum: stored, ...core } = snapshot
  if (!stored || stored !== checksum(core)) errors.push('Checksum do snapshot não confere.')
  return { valid: errors.length === 0, errors }
}

export const readSnapshotCandidate = (key, backend) => {
  const result = readStorage(key, null, backend)
  if (!result.success) return { ...result, valid: false, errors: [result.message] }
  if (!result.exists) return { ...result, valid: false, errors: ['Snapshot inexistente.'] }
  return { ...result, ...validateSnapshot(result.data) }
}

const mirrorLegacy = (snapshot, backend) => {
  const mapping = { transactions: STORAGE_KEYS.transactions, cards: STORAGE_KEYS.cards, accounts: STORAGE_KEYS.accounts, transfers: STORAGE_KEYS.transfers, recurrences: STORAGE_KEYS.recurrences, alertStates: STORAGE_KEYS.alertStates, categories: STORAGE_KEYS.categories, invoiceRecords: STORAGE_KEYS.invoices, filters: STORAGE_KEYS.filters, userSettings: STORAGE_KEYS.userSettings, costCenters: STORAGE_KEYS.costCenters }
  const failures = Object.entries(mapping).map(([field, key]) => writeStorage(key, ['accounts', 'transfers', 'recurrences', 'alertStates'].includes(field) ? (Array.isArray(snapshot.data[field]) ? snapshot.data[field] : []) : snapshot.data[field], backend)).filter((item) => !item.success)
  const version = writeStorage(STORAGE_KEYS.dataVersion, snapshot.financeDataVersion, backend); if (!version.success) failures.push(version)
  return failures
}

export const persistSnapshot = (snapshot, backend) => {
  const validation = validateSnapshot(snapshot)
  if (!validation.valid) return { success: false, errorType: 'VALIDATION_ERROR', message: validation.errors.join(' '), validation }
  const temp = writeStorage(STORAGE_KEYS.temp, snapshot, backend)
  if (!temp.success) return temp
  const tempCheck = readSnapshotCandidate(STORAGE_KEYS.temp, backend)
  if (!tempCheck.valid) return { success: false, errorType: 'WRITE_VERIFICATION_ERROR', message: `Snapshot temporário inválido: ${tempCheck.errors.join(' ')}` }
  const current = readSnapshotCandidate(STORAGE_KEYS.current, backend)
  if (current.valid) {
    const preserved = writeStorage(STORAGE_KEYS.lastValid, current.data, backend)
    if (!preserved.success) return preserved
  }
  const promoted = writeStorage(STORAGE_KEYS.current, snapshot, backend)
  if (!promoted.success) return promoted
  const check = readSnapshotCandidate(STORAGE_KEYS.current, backend)
  if (!check.valid || check.data.snapshotId !== snapshot.snapshotId) return { success: false, errorType: 'WRITE_VERIFICATION_ERROR', message: 'Falha ao validar o snapshot promovido.' }
  removeStorage(STORAGE_KEYS.temp, backend)
  writeStorage(STORAGE_KEYS.metadata, { lastSuccessfulSave: snapshot.createdAt, snapshotId: snapshot.snapshotId, revision: snapshot.revision }, backend)
  const mirrorFailures = mirrorLegacy(snapshot, backend)
  return { success: true, snapshot, warning: mirrorFailures.length ? 'Snapshot salvo, mas o espelho de compatibilidade ficou incompleto.' : null, mirrorFailures }
}

export const resolveSnapshot = (backend, legacyData) => {
  const current = readSnapshotCandidate(STORAGE_KEYS.current, backend)
  const temp = readSnapshotCandidate(STORAGE_KEYS.temp, backend)
  const lastValid = readSnapshotCandidate(STORAGE_KEYS.lastValid, backend)
  if (current.valid) return { success: true, source: 'current', snapshot: current.data, recovered: false, candidates: { current, temp, lastValid } }
  const recoverable = [temp, lastValid].filter((item) => item.valid).sort((a, b) => b.data.revision - a.data.revision)[0]
  if (recoverable) return { success: true, source: recoverable === temp ? 'temp' : 'lastValid', snapshot: recoverable.data, recovered: true, candidates: { current, temp, lastValid } }
  const legacyUsable = legacyData && arrays.every((key) => Array.isArray(legacyData[key]))
  if (legacyUsable) return { success: true, source: 'legacy', snapshot: createSnapshot(legacyData, { revision: 1 }), recovered: false, needsInitialSave: true, candidates: { current, temp, lastValid } }
  return { success: false, source: 'none', recoveryRequired: true, message: 'Nenhum estado válido foi encontrado. Os dados não foram sobrescritos.', candidates: { current, temp, lastValid } }
}

export const inspectPersistence = (backend) => {
  const current = readSnapshotCandidate(STORAGE_KEYS.current, backend); const temp = readSnapshotCandidate(STORAGE_KEYS.temp, backend); const lastValid = readSnapshotCandidate(STORAGE_KEYS.lastValid, backend)
  return { current, temp, lastValid, validCandidates: [current, temp, lastValid].filter((item) => item.valid).length }
}
