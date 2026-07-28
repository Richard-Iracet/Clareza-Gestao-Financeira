export const INSTALLMENT_IDENTITY_MIGRATION_VERSION = 1
export const createReliableId = (prefix = 'id') => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
export const isReliableInstallmentGroupId = (id) => Boolean(id && !String(id).startsWith('legacy-installment-'))

export const analyzeInstallmentIdentity = (transactions = []) => {
  const installments = transactions.filter((item) => Number(item.installmentTotal) > 1); const groups = new Map()
  installments.forEach((item) => { const key = item.installmentGroupId || null; if (key) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item) } })
  const collisions = [...groups.entries()].filter(([, items]) => new Set(items.map((item) => Number(item.installmentNumber))).size !== items.length)
  const missing = installments.filter((item) => !item.installmentGroupId); const safe = missing.filter((item) => item.purchaseGroupId)
  const ambiguous = missing.filter((item) => !item.purchaseGroupId)
  const incomplete = [...groups.entries()].filter(([, items]) => { const total = Math.max(...items.map((item) => Number(item.installmentTotal))); return items.length < total })
  return { totalTransactions: transactions.length, installments: installments.length, reliableGroups: [...groups.keys()].filter(isReliableInstallmentGroupId).length, legacyGroups: [...groups.keys()].filter((id) => !isReliableInstallmentGroupId(id)).length, missing: missing.length, collisions, incomplete, ambiguous, safe, predictedNewIds: new Set(safe.map((item) => item.purchaseGroupId)).size }
}

export const migrateSafeInstallmentIdentities = (transactions, migrationVersion = INSTALLMENT_IDENTITY_MIGRATION_VERSION) => {
  const report = analyzeInstallmentIdentity(transactions); const ids = new Map(); const changes = []
  const migrated = transactions.map((item) => {
    if (Number(item.installmentTotal) <= 1 || item.installmentGroupId || !item.purchaseGroupId) return item
    if (!ids.has(item.purchaseGroupId)) ids.set(item.purchaseGroupId, createReliableId('installment'))
    const installmentGroupId = ids.get(item.purchaseGroupId); changes.push({ transactionId: item.id, previousId: null, installmentGroupId })
    return { ...item, installmentGroupId, identityMigrationVersion: migrationVersion, identityMigratedAt: new Date().toISOString() }
  })
  if (migrated.length !== transactions.length) throw new Error('A migração alterou a quantidade de lançamentos.')
  return { transactions: migrated, report: { ...report, migrationVersion, groupsUpdated: ids.size, idsCreated: [...ids.values()], changes, unchanged: transactions.length - changes.length, beforeCount: transactions.length, afterCount: migrated.length } }
}
