import { createPayloadHash, createTransactionFingerprint, NORMALIZATION_VERSION } from './fingerprint.js'
import { EXTERNAL_STATUSES } from './originConstants.js'

const persistentId = () => { if (!globalThis.crypto?.randomUUID) throw new Error('crypto.randomUUID é obrigatório para identidade persistente.'); return globalThis.crypto.randomUUID() }
const sensitiveKey = /(^|_)(password|passwd|secret|token|authorization|cookie|session|api_key)($|_)/i
export const assertPayloadHasNoSecrets = (value, path = 'payload') => {
  if (!value || typeof value !== 'object') return true
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKey.test(key)) throw new Error(`Payload rejeitado: campo sensível em ${path}.${key}.`)
    assertPayloadHasNoSecrets(item, `${path}.${key}`)
  }
  return true
}
export const receiveExternalVersion = async ({ identity, versions = [], payload, normalized = {}, receivedAt = new Date().toISOString(), changeReason = 'provider_update' }) => {
  assertPayloadHasNoSecrets(payload)
  if (normalized.externalStatus && !EXTERNAL_STATUSES.includes(normalized.externalStatus)) throw new TypeError('Status externo inválido.')
  const payloadHash = await createPayloadHash(payload)
  const duplicate = versions.find((item) => item.payloadHash === payloadHash)
  if (duplicate) return { identity, versions, version: duplicate, created: false, auditEvents: [] }
  const fingerprint = await createTransactionFingerprint(normalized)
  const previous = versions.toSorted((a, b) => a.versionNumber - b.versionNumber).at(-1) || null
  const version = Object.freeze({ id: persistentId(), rawTransactionId: identity.id, versionNumber: (previous?.versionNumber || 0) + 1, payload: structuredClone(payload), payloadHash, normalizedPayload: structuredClone(normalized), normalizationVersion: NORMALIZATION_VERSION, fingerprint: fingerprint.fingerprint, fingerprintVersion: fingerprint.version, externalStatus: normalized.externalStatus || 'unknown', occurredAt: normalized.occurredAt || null, accountingDate: normalized.accountingDate || normalized.date || null, amount: normalized.amount ?? null, currency: normalized.currency || 'BRL', description: normalized.description || null, receivedAt, supersedesVersionId: previous?.id || null, changeReason })
  const statusChanged = previous && previous.externalStatus !== version.externalStatus
  const nextIdentity = { ...identity, externalStatus: version.externalStatus, currentVersionId: version.id, lastSeenAt: receivedAt, updatedAt: receivedAt }
  return { identity: nextIdentity, versions: [...versions, version], version, created: true, auditEvents: [{ eventType: 'external_version_received', changedFields: previous ? Object.keys(normalized).filter((key) => !Object.is(previous.normalizedPayload?.[key], normalized[key])) : Object.keys(normalized), occurredAt: receivedAt }, ...(statusChanged ? [{ eventType: 'external_status_changed', beforeData: { externalStatus: previous.externalStatus }, afterData: { externalStatus: version.externalStatus }, changedFields: ['externalStatus'], occurredAt: receivedAt }] : [])] }
}
