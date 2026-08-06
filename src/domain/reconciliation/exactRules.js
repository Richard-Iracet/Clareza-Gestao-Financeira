export const evaluateExactRules = ({ features, confirmedLink = null }) => {
  const reasons = []
  if (confirmedLink && !confirmedLink.revertedAt && !confirmedLink.reverted_at) reasons.push('CONFIRMED_LINK_EXISTS')
  if (features.sameRawTransactionId) reasons.push('SAME_RAW_TRANSACTION_ID')
  if (features.sameExternalId && features.sameCurrency && (features.sameAccount || features.sameCard)) reasons.push('SAME_TRUSTED_EXTERNAL_ID')
  if (features.pendingToPosted && (features.sameRawTransactionId || features.sameExternalId || confirmedLink)) reasons.push('PENDING_TO_POSTED_IDENTITY')
  return { exact: reasons.length > 0, reasons }
}
