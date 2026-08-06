export const PROVIDER_CONTROLLED_FIELDS = Object.freeze(['description', 'externalStatus', 'date', 'accountingDate', 'amount', 'currency', 'externalTransactionId'])
export const USER_CONTROLLED_FIELDS = Object.freeze(['category', 'categoryId', 'costCenter', 'costCenterId', 'notes', 'observation', 'tags', 'planned', 'presentation'])

export const applyExternalFieldUpdate = ({ current = {}, incoming = {} }) => {
  const next = { ...current }, changedFields = []
  PROVIDER_CONTROLLED_FIELDS.forEach((field) => {
    if (incoming[field] !== undefined && !Object.is(current[field], incoming[field])) { next[field] = incoming[field]; changedFields.push(field) }
  })
  USER_CONTROLLED_FIELDS.forEach((field) => { if (current[field] !== undefined) next[field] = current[field] })
  return { value: next, changedFields, providerFields: Object.fromEntries(PROVIDER_CONTROLLED_FIELDS.filter((field) => next[field] !== undefined).map((field) => [field, next[field]])), userFields: Object.fromEntries(USER_CONTROLLED_FIELDS.filter((field) => next[field] !== undefined).map((field) => [field, next[field]])) }
}
