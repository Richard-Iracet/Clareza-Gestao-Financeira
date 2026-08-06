import { EVENT_LINK_TYPES } from './eventTypes.js'
const id = () => globalThis.crypto.randomUUID()
export const createFinancialEventLink = ({ userId, sourceEventId, targetEventId, linkType, amountMinor = null, existingLinks = [], metadata = {}, at = new Date().toISOString() }) => {
  if (!EVENT_LINK_TYPES.includes(linkType)) throw new Error('Tipo de vínculo financeiro inválido.')
  if (!userId || !sourceEventId || !targetEventId || sourceEventId === targetEventId) throw new Error('Vínculo financeiro inválido.')
  const active = existingLinks.find((item) => item.userId === userId && item.sourceEventId === sourceEventId && item.targetEventId === targetEventId && item.linkType === linkType && !item.revertedAt)
  if (active) return { link: active, created: false, auditEvents: [] }
  const link = { id: id(), userId, sourceEventId, targetEventId, linkType, amountMinor, status: 'active', metadata, createdAt: at }
  return { link, created: true, auditEvents: [{ eventType: 'financial_event_link_created', occurredAt: at, correlationId: id(), beforeData: null, afterData: link }] }
}
export const revertFinancialEventLink = ({ link, revertedBy, reason, at = new Date().toISOString() }) => link.revertedAt ? { link, changed: false, auditEvents: [] } : { link: { ...link, status: 'reverted', revertedAt: at, revertedBy, revertReason: reason }, changed: true, auditEvents: [{ eventType: 'financial_event_link_reverted', occurredAt: at, beforeData: link, afterData: { status: 'reverted' }, reason }] }
