const persistentId = () => { if (!globalThis.crypto?.randomUUID) throw new Error('crypto.randomUUID é obrigatório.'); return globalThis.crypto.randomUUID() }
export const createReconciliation = ({ userId, rawTransactionId, financialTransactionId, decision = 'merge', decidedBy, at = new Date().toISOString(), existingLinks = [], existingDecisions = [] }) => {
  const active = existingLinks.find((item) => item.rawTransactionId === rawTransactionId && item.financialTransactionId === financialTransactionId && !item.revertedAt)
  if (active) return { link: active, decision: existingDecisions.find((item) => item.linkId === active.id) || null, created: false, auditEvents: [] }
  const link = { id: persistentId(), userId, rawTransactionId, financialTransactionId, linkType: decision === 'merge' ? 'merge' : 'manual_match', status: 'matched', isPrimary: true, createdBy: decidedBy, createdAt: at, updatedAt: at }
  const record = { id: persistentId(), userId, rawTransactionId, financialTransactionId, decision, status: 'matched', decidedBy, decidedAt: at, createdAt: at, linkId: link.id }
  return { link, decision: record, created: true, auditEvents: [{ eventType: decision === 'merge' ? 'merge_completed' : 'link_created', occurredAt: at, changedFields: ['link'] }] }
}
export const revertReconciliation = ({ link, decision, revertedBy, reason, at = new Date().toISOString() }) => {
  if (link.revertedAt) return { link, decision, reversalDecision: null, changed: false, auditEvents: [] }
  const revertedLink = { ...link, status: 'reverted', revertedAt: at, revertedBy, revertReason: reason, updatedAt: at }
  const revertedDecision = { ...decision, status: 'reverted', revertedAt: at, revertedBy, revertReason: reason }
  const reversalDecision = { id: persistentId(), userId: decision.userId, rawTransactionId: decision.rawTransactionId, financialTransactionId: decision.financialTransactionId, decision: 'unmerge', status: 'matched', decidedBy: revertedBy, decidedAt: at, supersedesDecisionId: decision.id, createdAt: at }
  return { link: revertedLink, decision: revertedDecision, reversalDecision, changed: true, auditEvents: [{ eventType: 'merge_reverted', occurredAt: at, reason, changedFields: ['link.status', 'decision.status'] }] }
}
