export const evaluateBlockingRules = ({ features }) => {
  const reasons = []
  if (!features.sameCurrency) reasons.push('CURRENCY_MISMATCH')
  if (features.previousDecisionManual && ['keep_separate','ignore','mark_conflict'].includes(features.previousDecision)) reasons.push('MANUAL_DECISION_PRIORITY')
  if (features.invoicePaymentRaw !== features.invoicePaymentFinancial) reasons.push('INVOICE_PAYMENT_VS_PURCHASE')
  if (features.ownTransferRaw !== features.ownTransferFinancial) reasons.push('OWN_TRANSFER_VS_COMMON_TRANSACTION')
  if (features.refundRaw !== features.refundFinancial && features.oppositeAmount) reasons.push('REFUND_REQUIRES_REVERSAL_LINK')
  if (!features.sameSign && !features.refundRaw && !features.refundFinancial && !features.ownTransferRaw && !features.ownTransferFinancial) reasons.push('SIGN_MISMATCH')
  if (features.installmentNumberEqual === false && features.installmentGroupEqual) reasons.push('DIFFERENT_INSTALLMENTS')
  if (features.competingCandidates > 1) reasons.push('MULTIPLE_EQUIVALENT_CANDIDATES')
  return reasons
}
