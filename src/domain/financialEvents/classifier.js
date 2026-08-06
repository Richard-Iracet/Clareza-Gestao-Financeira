import { FINANCIAL_EVENT_CLASSIFIER_VERSION, FINANCIAL_EVENT_TYPES } from './eventTypes.js'
import { getAccountingRule } from './accountingMatrix.js'
import { calculateEffectsWithRule } from './moneyEffects.js'
import { resolveFinancialDates } from './competenceService.js'
import { evaluateFinancialEventBlocks } from './blockingRules.js'

const text = (input) => String(input.description || input.originalDescription || '').toLowerCase()
const explicit = (input) => input.manualEventType || input.confirmedEventType || input.externalEventType || null
const infer = (input) => {
  if (input.transactionKind === 'invoice-payment') return input.partial ? 'invoice_partial_payment' : input.late ? 'invoice_late_payment' : 'invoice_payment'
  if (input.transferId || input.transfer_id) return input.transferDirection === 'in' ? 'internal_transfer_in' : 'internal_transfer_out'
  if (input.originalEventId || input.original_event_id) return input.partial ? 'partial_refund' : /chargeback|contest/.test(text(input)) ? 'chargeback' : 'refund'
  if (input.cardId || input.card_id) return input.installmentNumber || input.installment_number ? 'card_installment' : 'card_purchase'
  if (/saque/.test(text(input))) return 'cash_withdrawal'
  if (/dep[oó]sito/.test(text(input))) return 'cash_deposit'
  if (/tarifa|taxa/.test(text(input))) return 'account_fee'
  if (/investimento|aplica[cç][aã]o/.test(text(input))) return 'investment_purchase'
  return input.type === 'income' ? 'cash_income' : input.type === 'expense' ? 'cash_expense' : 'under_review'
}
export const classifyFinancialEvent = ({ input, referenceDate = new Date().toISOString().slice(0,10) }) => {
  if (!input?.userId && !input?.user_id) throw new Error('userId é obrigatório para classificar evento financeiro.')
  const selected = explicit(input), eventType = selected || infer(input), method = input.manualEventType ? 'manual' : input.confirmedLink ? 'explicit_link' : input.externalEventType ? 'external_type' : selected ? 'reconciliation' : 'deterministic_rule'
  if (!FINANCIAL_EVENT_TYPES.includes(eventType)) throw new Error('Tipo de evento financeiro inválido.')
  const dates = resolveFinancialDates({ transaction: input }), rule = getAccountingRule(eventType), blockingReasons = evaluateFinancialEventBlocks({ eventType, input, dates, referenceDate })
  const requiresReview = rule.requiresReview || blockingReasons.length > 0 || eventType === 'under_review'
  return { eventType: requiresReview && blockingReasons.length ? 'under_review' : eventType, proposedEventType: eventType, classificationStatus: requiresReview ? 'under_review' : 'classified', classificationMethod: method, classificationVersion: FINANCIAL_EVENT_CLASSIFIER_VERSION, confidence: selected || method === 'explicit_link' ? 100 : requiresReview ? 0 : 90, reasons: selected ? ['EXPLICIT_CLASSIFICATION'] : [`RULE_${eventType.toUpperCase()}`], warnings: blockingReasons, requiresReview, effects: requiresReview && blockingReasons.length ? calculateEffectsWithRule({ amount: input.amount, rule: getAccountingRule('under_review') }) : calculateEffectsWithRule({ amount: input.amount, rule }), dates, requiresLink: rule.requiresLink }
}
