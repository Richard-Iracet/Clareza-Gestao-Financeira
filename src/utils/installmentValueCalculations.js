export const INSTALLMENT_VALUE_MIGRATION_VERSION = 1
export const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
export const getTransactionAmount = (transaction) => { const value = Number(transaction?.amount); return Number.isFinite(value) ? roundMoney(value) : 0 }
export const distributePurchaseTotal = (total, installments) => {
  const count = Number(installments); const cents = Math.round(Number(total) * 100)
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(cents) || cents < 0) throw new Error('Valor total ou quantidade de parcelas inválida.')
  const base = Math.floor(cents / count); const remainder = cents - base * count
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100)
}
export const normalizeInstallmentValues = (transaction, options = {}) => {
  const total = Math.max(1, Number.parseInt(transaction.installmentTotal ?? transaction.installments, 10) || 1); const number = Math.max(1, Number.parseInt(transaction.installmentNumber, 10) || 1)
  const mode = transaction.valueInputMode || transaction.installmentValueType || 'installment'; const raw = Number(options.inputAmount ?? (mode === 'total' ? transaction.totalPurchaseAmount ?? transaction.amount : transaction.amount))
  if (!Number.isFinite(raw) || raw < 0) throw new Error('O valor da parcela deve ser numérico e não negativo.')
  const values = mode === 'total' ? distributePurchaseTotal(raw, total) : null; const amount = options.accountingAmount !== undefined ? roundMoney(options.accountingAmount) : values ? values[number - 1] : roundMoney(raw)
  return { ...transaction, amount, installmentAmount: amount, installmentNumber: number, installmentTotal: total, valueInputMode: mode, totalPurchaseAmount: mode === 'total' ? roundMoney(raw) : transaction.totalPurchaseAmount ?? roundMoney(amount * total) }
}
export const analyzeInstallmentValues = (transactions = []) => {
  const installments = transactions.filter((item) => Number(item.installmentTotal) > 1); const safe = installments.filter((item) => Number.isFinite(Number(item.amount)) && item.installmentAmount == null)
  const divergent = installments.filter((item) => item.installmentAmount != null && Number(item.amount) !== Number(item.installmentAmount)); const missingMode = installments.filter((item) => !item.valueInputMode)
  return { total: installments.length, safe, divergent, missingMode, ambiguous: divergent }
}
export const migrateSafeInstallmentValues = (transactions) => {
  const report = analyzeInstallmentValues(transactions); const changed = []
  const migrated = transactions.map((item) => { if (!report.safe.includes(item)) return item; changed.push(item.id); return { ...item, installmentAmount: roundMoney(item.amount), valueInputMode: item.valueInputMode || 'installment', installmentValueMigrationVersion: INSTALLMENT_VALUE_MIGRATION_VERSION } })
  if (migrated.length !== transactions.length) throw new Error('A migração alterou a contagem de lançamentos.')
  return { transactions: migrated, report: { beforeCount: transactions.length, afterCount: migrated.length, changed, ambiguous: report.ambiguous.map((item) => item.id), migrationVersion: INSTALLMENT_VALUE_MIGRATION_VERSION } }
}
