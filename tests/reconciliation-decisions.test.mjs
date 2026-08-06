import test from 'node:test'
import assert from 'node:assert/strict'
import { decideReconciliation, undoReconciliationDecision } from '../src/domain/reconciliation/decisionService.js'
import { reprocessReconciliation } from '../src/domain/reconciliation/reprocessingService.js'

const base = { userId: 'u1', rawTransactionId: 'r1', financialTransactionId: 'f1', decidedBy: 'user:u1' }
test('decisão manual é idempotente e reversível sem apagar histórico', () => { const first = decideReconciliation({ ...base, action: 'keep_separate' }); const duplicate = decideReconciliation({ ...base, action: 'keep_separate', existingDecisions: [first.decision] }); assert.equal(first.created, true); assert.equal(duplicate.created, false); const undone = undoReconciliationDecision({ decision: first.decision, revertedBy: 'user:u1', reason: 'correção' }); assert.equal(undone.decision.status, 'reverted'); assert.equal(undone.changed, true); assert.equal(undoReconciliationDecision({ decision: undone.decision, revertedBy: 'user:u1', reason: 'repetição' }).changed, false) })
test('reprocessamento preserva decisão manual e invalida somente candidatos anteriores', () => { const decision = { id: 'd1', rawTransactionId: 'r1', financialTransactionId: 'f1', decision: 'keep_separate', decidedBy: 'user:u1' }; const result = reprocessReconciliation({ userId: 'u1', rawTransactions: [], financialTransactions: [], decisions: [decision], previousCandidates: [{ id: 'c1', status: 'suggested' }], config: { mode: 'observation' } }); assert.deepEqual(result.preservedDecisionIds, ['d1']); assert.deepEqual(result.supersededCandidateIds, ['c1']) })
test('ação desconhecida é recusada explicitamente', () => assert.throws(() => decideReconciliation({ ...base, action: 'guess' }), /inválida/))
