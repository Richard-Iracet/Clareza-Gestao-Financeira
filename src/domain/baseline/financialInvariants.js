const money = (value) => Math.round((Number(value) || 0) * 100) / 100

export const selectFinancialInvariants = (report = {}) => ({
  accountBalances: report.totals?.byAccount || [], consolidatedBalance: report.totals?.global?.consolidatedBalance || 0,
  realizedIncomeByCompetence: (report.totals?.byPeriod || []).map((item) => ({ period: item.period, value: item.incomeRealized })),
  realizedExpensesByCompetence: (report.totals?.byPeriod || []).map((item) => ({ period: item.period, value: item.expensesRealized })),
  incomePending: report.totals?.global?.incomePending || 0, expensesPending: report.totals?.global?.expensesPending || 0,
  invoicesByCardAndCompetence: report.totals?.invoices || [], openInvoiceBalance: report.totals?.global?.openInvoiceBalance || 0,
  transfers: report.totals?.transfers || {}, monthlyResult: (report.totals?.byPeriod || []).map((item) => ({ period: item.period, value: item.result })),
  financialCycleResult: report.totals?.global?.financialCycleResult || 0, projectedBalance: report.totals?.global?.projectedBalance || 0,
  nextThirtyDays: report.totals?.global?.nextThirtyDays || {}, futureCommitments: report.totals?.global?.futureCommitments || 0,
  installments: { groups: report.counts?.installmentGroups || 0, count: report.counts?.installments || 0 },
  recurrences: { rules: report.counts?.recurrences || 0, occurrences: report.counts?.recurrenceOccurrences || 0 },
})

const category = (path) => path.includes('invoice') ? 'invoice' : path.includes('transfer') ? 'transfer' : path.includes('recurrence') ? 'recurrence' : path.includes('account') || path.includes('Balance') ? 'balance' : 'financial-total'
export const compareBaselineReports = (previous, next) => {
  const differences = []
  const walk = (left, right, path = '') => {
    if (JSON.stringify(left) === JSON.stringify(right)) return
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
      keys.forEach((key) => walk(left[key], right[key], path ? `${path}.${key}` : key)); return
    }
    const monetary = typeof left === 'number' && typeof right === 'number'
    differences.push({ path, previousValue: left, nextValue: right, monetaryDifference: monetary ? money(right - left) : null, severity: monetary && money(right - left) !== 0 ? 'high' : 'medium', probableCategory: category(path) })
  }
  walk(selectFinancialInvariants(previous), selectFinancialInvariants(next))
  return { equal: differences.length === 0, differences }
}
