export const applyTombstone = (identity, { at = new Date().toISOString(), reason = 'external_removed' } = {}) => {
  if (identity.tombstoneAt && identity.externalStatus === 'removed') return { identity, changed: false, auditEvents: [] }
  return { identity: { ...identity, externalStatus: 'removed', tombstoneAt: at, lastSeenAt: at, updatedAt: at }, changed: true, auditEvents: [{ eventType: 'tombstone_created', reason, occurredAt: at, changedFields: ['externalStatus', 'tombstoneAt'] }] }
}
export const restoreReappeared = (identity, { status = 'posted', at = new Date().toISOString() } = {}) => {
  if (!identity.tombstoneAt && identity.externalStatus === status) return { identity, changed: false, auditEvents: [] }
  return { identity: { ...identity, externalStatus: status, tombstoneAt: null, reappearedAt: at, lastSeenAt: at, updatedAt: at }, changed: true, auditEvents: [{ eventType: 'item_reappeared', occurredAt: at, changedFields: ['externalStatus', 'tombstoneAt', 'reappearedAt'] }] }
}
export const softDelete = (entity, { at = new Date().toISOString(), reason } = {}) => entity.deletedAt ? { entity, changed: false, auditEvents: [] } : { entity: { ...entity, internalStatus: 'deleted', deletedAt: at, deletedReason: reason || null }, changed: true, auditEvents: [{ eventType: 'soft_deleted', occurredAt: at, reason, changedFields: ['internalStatus', 'deletedAt', 'deletedReason'] }] }
