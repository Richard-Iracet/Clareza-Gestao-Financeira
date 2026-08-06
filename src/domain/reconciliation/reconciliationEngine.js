import { selectReconciliationCandidates } from './candidateSelector.js'
import { extractReconciliationFeatures } from './featureExtractor.js'
import { evaluateExactRules } from './exactRules.js'
import { evaluateBlockingRules } from './blockingRules.js'
import { calculateReconciliationScore } from './scoreCalculator.js'
import { mergeReconciliationConfig, RECONCILIATION_FEATURE_VERSION } from './reconciliationConfig.js'
import { createReconciliation } from '../origin/reconciliationService.js'

const id = () => { if (!globalThis.crypto?.randomUUID) throw new Error('crypto.randomUUID é obrigatório.'); return globalThis.crypto.randomUUID() }
const field = (value, camel, snake = camel) => value?.[camel] ?? value?.[snake] ?? null

export const runReconciliationEngine = ({ userId, rawTransactions = [], financialTransactions = [], links = [], decisions = [], config: overrides = {}, runId = id() }) => {
  const config = mergeReconciliationConfig(overrides)
  if (config.mode === 'disabled') return { run: { id: runId, userId, mode: 'disabled', status: 'skipped', stats: { raw: 0, candidates: 0 } }, candidates: [], automaticMatches: [] }
  const candidates = []
  for (const raw of rawTransactions.filter((item) => field(item, 'userId', 'user_id') === userId)) {
    const selected = selectReconciliationCandidates({ raw, financialTransactions, userId, config })
    const previousDecision = decisions.find((item) => field(item, 'rawTransactionId', 'raw_transaction_id') === raw.id && !field(item, 'revertedAt', 'reverted_at'))
    selected.forEach((financial) => {
      const confirmedLink = links.find((item) => field(item, 'rawTransactionId', 'raw_transaction_id') === raw.id && field(item, 'financialTransactionId', 'financial_transaction_id') === financial.id && !field(item, 'revertedAt', 'reverted_at'))
      const features = extractReconciliationFeatures({ raw, financial, competingCandidates: selected.length, previousDecision })
      const exact = evaluateExactRules({ features, confirmedLink })
      const blockingReasons = evaluateBlockingRules({ features })
      const result = calculateReconciliationScore({ features, exact, blockingReasons, config: { ...config, exactAutoMatch: config.mode === 'exact_auto_match' && config.exactAutoMatch } })
      candidates.push({ id: id(), runId, userId, rawTransactionId: raw.id, financialTransactionId: financial.id, candidateGroup: raw.id, featureVersion: RECONCILIATION_FEATURE_VERSION, features, ...result, status: result.classification === 'unmatched' ? 'unmatched' : 'suggested' })
    })
  }
  const grouped = Map.groupBy ? Map.groupBy(candidates, (item) => item.rawTransactionId) : candidates.reduce((map, item) => map.set(item.rawTransactionId, [...(map.get(item.rawTransactionId) || []), item]), new Map())
  for (const group of grouped.values()) group.sort((a, b) => b.score - a.score || a.financialTransactionId.localeCompare(b.financialTransactionId)).forEach((item, index) => { item.rank = index + 1 })
  const automaticMatches = candidates.filter((item) => item.rank === 1 && item.eligibleForAutoMatch)
  return { run: { id: runId, userId, mode: config.mode, status: 'completed', algorithmVersion: candidates[0]?.algorithmVersion || 'reconciliation-score-v1', featureVersion: RECONCILIATION_FEATURE_VERSION, stats: { raw: rawTransactions.length, candidates: candidates.length, exact: candidates.filter((item) => item.classification === 'exact').length, conflicts: candidates.filter((item) => item.classification === 'conflict').length, automaticMatches: automaticMatches.length } }, candidates, automaticMatches }
}

export const materializeExactAutomaticMatches = ({ engineResult, userId, decidedBy = 'system:reconciliation', existingLinks = [], existingDecisions = [] }) => engineResult.automaticMatches.map((candidate) => {
  if (candidate.classification !== 'exact' || candidate.blockingReasons.length || !candidate.eligibleForAutoMatch) throw new Error('Somente correspondência exata e sem bloqueios pode ser materializada automaticamente.')
  return createReconciliation({ userId, rawTransactionId: candidate.rawTransactionId, financialTransactionId: candidate.financialTransactionId, decision: 'match', decidedBy, existingLinks, existingDecisions })
})
