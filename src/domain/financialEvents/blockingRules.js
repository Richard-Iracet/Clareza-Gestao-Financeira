import { isFutureCompetence } from './competenceService.js'
export const evaluateFinancialEventBlocks = ({ eventType, input, dates, referenceDate }) => {
  const reasons = []
  if (input.transactionKind === 'invoice-payment' && ['card_purchase','card_installment'].includes(eventType)) reasons.push('INVOICE_PAYMENT_CANNOT_BE_PURCHASE')
  if (eventType.startsWith('internal_transfer_') && ['income','expense'].includes(input.type)) reasons.push('INTERNAL_TRANSFER_NOT_INCOME_OR_EXPENSE')
  if (['refund','partial_refund','chargeback'].includes(eventType) && !input.originalEventId && !input.original_event_id) reasons.push('REVERSAL_REQUIRES_ORIGINAL')
  if (eventType === 'cash_withdrawal' && input.type === 'expense') reasons.push('WITHDRAWAL_NOT_AUTOMATIC_EXPENSE')
  if (eventType === 'cash_deposit' && input.type === 'income') reasons.push('DEPOSIT_NOT_AUTOMATIC_INCOME')
  if (eventType === 'investment_purchase' && input.type === 'expense') reasons.push('ASSET_PURCHASE_NOT_CONSUMPTION')
  if (eventType === 'invoice_installment' && input.type === 'expense') reasons.push('INVOICE_PRINCIPAL_NOT_NEW_EXPENSE')
  if (eventType === 'card_installment' && isFutureCompetence(dates, referenceDate)) reasons.push('FUTURE_INSTALLMENT_EXCLUDED_FROM_CURRENT_PERIOD')
  return reasons
}
