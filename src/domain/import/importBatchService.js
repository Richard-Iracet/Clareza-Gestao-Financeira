import { createTransactionFingerprint } from '../origin/fingerprint.js'
import { IMPORT_LIMITS, IMPORT_NORMALIZATION_VERSION, IMPORT_PARSER_VERSION } from './importConstants.js'
import { decodeFileBytes, detectFileType, hashFileBytes, validateImportFile } from './fileValidation.js'
import { parseCsv } from './csvParser.js'
import { normalizeCsvRows, validateCsvMapping } from './csvNormalizer.js'
import { parseOfx } from './ofxParser.js'
import { serializeMoneySummary, summarizeMoney } from './moneyNormalizer.js'

const persistentId = () => { if (!crypto?.randomUUID) throw new Error('crypto.randomUUID é obrigatório.'); return crypto.randomUUID() }
const safePayload = (payload) => Object.fromEntries(Object.entries(payload).map(([key, value]) => [String(key).slice(0, 120), String(value ?? '').slice(0, IMPORT_LIMITS.maxFieldLength)]))
export const assertImportEnabled = (enabled) => { if (!enabled) { const error = new Error('Importação OFX/CSV está desativada.'); error.code = 'FEATURE_DISABLED'; throw error } }

const classify = (record, context, seen, existing) => {
  if (record.errors.length) return { status: 'invalid', duplicate: null, reasons: [] }
  const reliableKey = record.externalTransactionId ? `${context}:${record.externalTransactionId}` : null
  if (reliableKey && (seen.externalIds.has(reliableKey) || existing.externalIds?.has(reliableKey))) return { status: 'exact_duplicate', duplicate: { method: 'external_id', key: record.externalTransactionId }, reasons: ['Mesmo ID externo no mesmo contexto.'] }
  const fingerprintKey = `${context}:${record.fingerprintVersion}:${record.fingerprint}`
  if (seen.fingerprints.has(fingerprintKey) || existing.fingerprints?.has(fingerprintKey)) return { status: 'possible_duplicate', duplicate: { method: 'fingerprint', fingerprint: record.fingerprint }, reasons: ['Fingerprint semelhante; requer revisão.'] }
  if (reliableKey) seen.externalIds.add(reliableKey); seen.fingerprints.add(fingerprintKey)
  return { status: record.warnings.length ? 'suspicious' : 'new', duplicate: null, reasons: record.warnings.map((item) => item.message) }
}
export const prepareImportBatch = async ({ enabled, userId, file, statementType = 'checking', csv = {}, contextId = 'unassigned', existing = {} }) => {
  assertImportEnabled(enabled)
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes), decoded = decodeFileBytes(bytes), type = detectFileType(file.name)
  const validation = validateImportFile({ name: file.name, size: bytes.byteLength, text: decoded.text, type })
  if (!validation.valid) return { success: false, errors: validation.errors }
  const fileHash = await hashFileBytes(bytes)
  let parsed, records
  if (type === 'ofx') { parsed = await parseOfx(decoded.text); records = parsed.records; statementType = parsed.statement.statementType }
  else { parsed = parseCsv(decoded.text, csv); if (!csv.mapping) return { success: true, requiresMapping: true, fileHash, parsed, preview: parsed.rows.slice(0, IMPORT_LIMITS.previewRows) }; const mappingValidation = validateCsvMapping(csv.mapping); if (!mappingValidation.valid) return { success: false, errors: [{ code: 'MISSING_MAPPING', message: `Mapeie: ${mappingValidation.missing.join(', ')}.` }] }; records = normalizeCsvRows(parsed, csv.mapping, csv) }
  const prior = existing.batches?.find((batch) => batch.userId === userId && batch.fileHash === fileHash && batch.statementType === statementType && batch.contextId === contextId)
  if (prior && !csv.reprocess) return { success: false, duplicateBatch: prior, errors: [{ code: 'DUPLICATE_FILE', message: 'Este arquivo já foi importado neste contexto.' }] }
  const context = `${userId}:${type}:${contextId}`, seen = { externalIds: new Set(), fingerprints: new Set() }
  for (const record of records) {
    const fingerprint = await createTransactionFingerprint({ description: record.normalizedDescription, amount: record.amount.valid ? record.amount.decimal : '', accountingDate: record.date.accountingDate, externalAccountKey: contextId, externalStatus: record.externalStatus })
    record.fingerprint = fingerprint.fingerprint; record.fingerprintVersion = fingerprint.version
    const classification = classify(record, context, seen, existing); record.reviewStatus = classification.status; record.possibleDuplicate = classification.duplicate; record.suspicionReasons = classification.reasons
  }
  const money = serializeMoneySummary(summarizeMoney(records)), counts = Object.fromEntries(['new','suspicious','exact_duplicate','possible_duplicate','invalid'].map((status) => [status, records.filter((record) => record.reviewStatus === status).length]))
  const batch = { id: persistentId(), userId, fileType: type, originalFilename: validation.sanitizedName, fileSize: bytes.byteLength, fileHash, parserVersion: IMPORT_PARSER_VERSION, status: 'awaiting_review', statementType, defaultCurrency: csv.defaultCurrency || parsed.statement?.currency || 'BRL', sourceTimezone: parsed.records?.find((record) => record.date.timezone)?.date.timezone || null, csvMapping: type === 'csv' ? { delimiter: parsed.delimiter, hasHeader: parsed.hasHeader, mapping: csv.mapping, dateFormat: csv.dateFormat, decimalFormat: csv.decimalFormat, invertSign: Boolean(csv.invertSign) } : {}, totals: money, rowCount: records.length, validCount: counts.new, suspiciousCount: counts.suspicious + counts.possible_duplicate, duplicateCount: counts.exact_duplicate, invalidCount: counts.invalid, contextId, reprocess: Boolean(csv.reprocess), encoding: decoded.encoding, createdAt: new Date().toISOString() }
  return { success: true, batch, records: records.map((record) => ({ ...record, id: persistentId(), rawPayload: safePayload(record.rawPayload), normalizationVersion: IMPORT_NORMALIZATION_VERSION })) }
}
export const decideImportRecord = (record, decision, at = new Date().toISOString()) => {
  if (!['accept','ignore','restore'].includes(decision)) throw new TypeError('Decisão inválida.')
  if (decision === 'accept' && record.reviewStatus === 'invalid') throw new Error('Registro inválido não pode ser aceito.')
  return { ...record, reviewStatus: decision === 'accept' ? 'accepted' : decision === 'ignore' ? 'ignored' : (record.previousReviewStatus || 'new'), userDecision: decision, updatedAt: at }
}
