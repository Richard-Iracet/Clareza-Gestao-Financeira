import { runReconciliationEngine } from './reconciliationEngine.js'

export const reprocessReconciliation = (input) => {
  const preservedDecisions = (input.decisions || []).filter((item) => !item.revertedAt && !item.reverted_at)
  const result = runReconciliationEngine({ ...input, decisions: preservedDecisions })
  return { ...result, supersededCandidateIds: (input.previousCandidates || []).filter((item) => item.status !== 'superseded').map((item) => item.id), preservedDecisionIds: preservedDecisions.map((item) => item.id) }
}
