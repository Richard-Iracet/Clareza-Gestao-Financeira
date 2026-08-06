export const RECONCILIATION_TRANSITIONS = Object.freeze({ unmatched: ['suggested','matched'], suggested: ['matched','ignored','conflict'], matched: ['reverted'], ignored: ['reverted'], conflict: ['suggested'], reverted: [] })
export const transitionReconciliation = (current, next) => {
  if (!RECONCILIATION_TRANSITIONS[current]?.includes(next)) { const error = new Error(`Transição de reconciliação inválida: ${current} → ${next}.`); error.code = 'INVALID_RECONCILIATION_TRANSITION'; throw error }
  return next
}
