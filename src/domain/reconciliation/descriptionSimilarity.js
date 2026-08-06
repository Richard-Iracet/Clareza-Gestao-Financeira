import { RECONCILIATION_DESCRIPTION_VERSION } from './reconciliationConfig.js'

const prefixes = /^(compra|pagamento|pgto|debito|débito|credito|crédito|pix|ted|doc)\s*[-:*]?\s*/i
export const normalizeReconciliationDescription = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(prefixes, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
export const descriptionTokens = (value) => [...new Set(normalizeReconciliationDescription(value).split(' ').filter((token) => token.length > 1))]
export const descriptionSimilarity = (left, right) => {
  const normalizedLeft = normalizeReconciliationDescription(left), normalizedRight = normalizeReconciliationDescription(right), leftTokens = descriptionTokens(left), rightTokens = descriptionTokens(right)
  if (!normalizedLeft && !normalizedRight) return { value: 0, method: 'empty', leftTokens, rightTokens, version: RECONCILIATION_DESCRIPTION_VERSION }
  if (normalizedLeft === normalizedRight) return { value: 1, method: 'normalized_exact', leftTokens, rightTokens, version: RECONCILIATION_DESCRIPTION_VERSION }
  const union = new Set([...leftTokens, ...rightTokens]), intersection = leftTokens.filter((token) => rightTokens.includes(token))
  return { value: union.size ? intersection.length / union.size : 0, method: 'token_jaccard', leftTokens, rightTokens, version: RECONCILIATION_DESCRIPTION_VERSION }
}
export const normalizedMerchant = (value) => descriptionTokens(value).filter((token) => !/^\d+$/.test(token)).slice(0, 3).join(' ')
