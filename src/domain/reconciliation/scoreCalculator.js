import { mergeReconciliationConfig, RECONCILIATION_ALGORITHM_VERSION } from './reconciliationConfig.js'

const add = (condition, points, code, reasons, score) => condition ? { score: score + points, reasons: [...reasons, code] } : { score, reasons }
export const calculateReconciliationScore = ({ features, exact, blockingReasons = [], config: overrides = {} }) => {
  const config = mergeReconciliationConfig(overrides); let score = 0, positiveReasons = [], negativeReasons = []
  ;({ score, reasons: positiveReasons } = add(features.equalAmount, 28, 'AMOUNT_EQUAL', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.sameCurrency, 8, 'CURRENCY_EQUAL', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.sameAccount || features.sameCard, 16, features.sameCard ? 'CARD_EQUAL' : 'ACCOUNT_EQUAL', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.dateDifferenceDays === 0, 12, 'DATE_EQUAL', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.dateDifferenceDays > 0 && features.dateDifferenceDays <= 3, 8, 'DATE_NEAR', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.descriptionSimilarity >= .85, 16, 'DESCRIPTION_HIGH_SIMILARITY', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.descriptionSimilarity >= .5 && features.descriptionSimilarity < .85, 8, 'DESCRIPTION_PARTIAL_SIMILARITY', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.sameFingerprint, 12, 'FINGERPRINT_EQUAL', positiveReasons, score))
  ;({ score, reasons: positiveReasons } = add(features.complementarySources, 6, 'MANUAL_EXTERNAL_COMPLEMENT', positiveReasons, score))
  if (!features.compatibleFinancialType) { score -= 25; negativeReasons.push('FINANCIAL_TYPE_MISMATCH') }
  if ((features.dateDifferenceDays ?? 999) > 10) { score -= 20; negativeReasons.push('DATE_DISTANT') }
  score = Math.max(0, Math.min(100, score))
  let classification = score >= config.strongThreshold ? 'strong_suggestion' : score >= config.weakThreshold ? 'weak_suggestion' : 'unmatched'
  if (exact.exact && !blockingReasons.length) classification = 'exact'
  else if (blockingReasons.length) classification = blockingReasons.includes('MULTIPLE_EQUIVALENT_CANDIDATES') ? 'conflict' : 'blocked'
  return { score, classification, algorithmVersion: RECONCILIATION_ALGORITHM_VERSION, positiveReasons: [...exact.reasons, ...positiveReasons], negativeReasons, blockingReasons, requiresReview: classification !== 'exact', eligibleForAutoMatch: classification === 'exact' && blockingReasons.length === 0 && config.exactAutoMatch === true }
}
