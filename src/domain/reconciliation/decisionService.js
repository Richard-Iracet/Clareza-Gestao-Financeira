import { createReconciliation, revertReconciliation } from '../origin/reconciliationService.js'

export const decideReconciliation = ({ action, userId, rawTransactionId, financialTransactionId = null, decidedBy, candidateId = null, existingLinks = [], existingDecisions = [], at }) => {
  if (!['match','merge','keep_separate','ignore','mark_conflict'].includes(action)) throw new Error('Decisão de reconciliação inválida.')
  if (['match','merge'].includes(action)) return createReconciliation({ userId, rawTransactionId, financialTransactionId, decision: action, decidedBy, existingLinks, existingDecisions, at })
  const active = existingDecisions.find((item) => item.rawTransactionId === rawTransactionId && item.financialTransactionId === financialTransactionId && item.decision === action && !item.revertedAt)
  if (active) return { decision: active, created: false, link: null, auditEvents: [] }
  const now = at || new Date().toISOString()
  const id = globalThis.crypto.randomUUID()
  return { decision: { id, userId, candidateId, rawTransactionId, financialTransactionId, decision: action, status: action === 'ignore' ? 'ignored' : action === 'mark_conflict' ? 'conflict' : 'matched', decidedBy, decidedAt: now, createdAt: now }, link: null, created: true, auditEvents: [{ eventType: 'reconciliation_decision_recorded', occurredAt: now, reason: action, changedFields: ['decision'] }] }
}

export const undoReconciliationDecision = ({ link, decision, revertedBy, reason, at }) => {
  if (!link) {
    if (decision.revertedAt) return { decision, changed: false, auditEvents: [] }
    const now = at || new Date().toISOString()
    return { decision: { ...decision, status: 'reverted', revertedAt: now, revertedBy, revertReason: reason }, changed: true, auditEvents: [{ eventType: 'reconciliation_decision_reverted', occurredAt: now, reason, changedFields: ['decision.status'] }] }
  }
  return revertReconciliation({ link, decision, revertedBy, reason, at })
}
