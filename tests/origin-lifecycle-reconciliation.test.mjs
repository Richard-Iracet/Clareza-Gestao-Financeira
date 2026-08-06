import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTombstone, restoreReappeared } from '../src/domain/origin/lifecycleService.js'
import { createReconciliation, revertReconciliation } from '../src/domain/origin/reconciliationService.js'

test('tombstone preserva identidade e reaparecimento mantém histórico rastreável', () => {
  const original = { id: 'raw', externalStatus: 'posted', versions: ['v1'] }
  const removed = applyTombstone(original, { at: '2026-08-01T00:00:00.000Z' })
  assert.equal(removed.identity.id, 'raw'); assert.deepEqual(removed.identity.versions, ['v1']); assert.equal(removed.identity.externalStatus, 'removed')
  const restored = restoreReappeared(removed.identity, { at: '2026-08-02T00:00:00.000Z' })
  assert.equal(restored.identity.tombstoneAt, null); assert.equal(restored.identity.reappearedAt, '2026-08-02T00:00:00.000Z'); assert.equal(restored.auditEvents[0].eventType, 'item_reappeared')
})

test('mescla e desfazer são idempotentes e não apagam origem ou entidade financeira', () => {
  const merged = createReconciliation({ userId: 'u', rawTransactionId: 'raw', financialTransactionId: 'financial', decidedBy: 'user:u', at: '2026-08-01T00:00:00.000Z' })
  const duplicate = createReconciliation({ userId: 'u', rawTransactionId: 'raw', financialTransactionId: 'financial', decidedBy: 'user:u', existingLinks: [merged.link], existingDecisions: [merged.decision] })
  assert.equal(duplicate.created, false)
  const reverted = revertReconciliation({ link: merged.link, decision: merged.decision, revertedBy: 'user:u', reason: 'engano', at: '2026-08-02T00:00:00.000Z' })
  assert.equal(reverted.link.rawTransactionId, 'raw'); assert.equal(reverted.link.financialTransactionId, 'financial'); assert.equal(reverted.reversalDecision.decision, 'unmerge')
  const repeated = revertReconciliation({ link: reverted.link, decision: reverted.decision, revertedBy: 'user:u', reason: 'engano' })
  assert.equal(repeated.changed, false); assert.equal(repeated.reversalDecision, null)
})
