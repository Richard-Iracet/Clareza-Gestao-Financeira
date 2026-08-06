import { normalizeImportedMoney } from '../import/moneyNormalizer.js'
import { mergeReconciliationConfig } from './reconciliationConfig.js'

const minor = (value) => { const parsed = normalizeImportedMoney(String(value ?? ''), { decimalFormat: 'international' }); return parsed.valid ? BigInt(parsed.minorUnits) : null }
const dateValue = (item) => String(item.accountingDate ?? item.accounting_date ?? item.transactionDate ?? item.transaction_date ?? item.date ?? '').slice(0, 10)
export const daysBetween = (left, right) => { const a = /^\d{4}-\d{2}-\d{2}$/.test(dateValue(left)) ? Date.parse(`${dateValue(left)}T00:00:00Z`) : NaN, b = /^\d{4}-\d{2}-\d{2}$/.test(dateValue(right)) ? Date.parse(`${dateValue(right)}T00:00:00Z`) : NaN; return Number.isNaN(a) || Number.isNaN(b) ? null : Math.abs(Math.round((a - b) / 86400000)) }
export const selectReconciliationCandidates = ({ raw, financialTransactions = [], userId, config: overrides, offset = 0 }) => {
  const config = mergeReconciliationConfig(overrides), rawAmount = minor(raw.amount), rawCurrency = String(raw.currency || 'BRL').toUpperCase(), rawAccount = raw.financialAccountId ?? raw.financial_account_id ?? raw.accountId ?? raw.account_id, rawCard = raw.cardId ?? raw.card_id
  return financialTransactions.filter((item) => item.userId === userId || item.user_id === userId).filter((item) => {
    const itemAmount = minor(item.amount); if (rawAmount === null || itemAmount === null) return false
    if (String(item.currency || 'BRL').toUpperCase() !== rawCurrency) return false
    const compatibleContext = !rawAccount && !rawCard || rawAccount && rawAccount === (item.accountId ?? item.account_id) || rawCard && rawCard === (item.cardId ?? item.card_id)
    if (!compatibleContext) return false
    const dateDifference = daysBetween(raw, item); if (dateDifference === null || dateDifference > config.refundWindowDays) return false
    return rawAmount === itemAmount || rawAmount === -itemAmount
  }).slice(offset, offset + config.candidateLimit)
}
export { minor as moneyToMinorUnits }
