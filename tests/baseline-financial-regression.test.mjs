import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaselineReport } from '../src/domain/baseline/baselineReport.js'

const referenceDate = new Date(2026, 6, 15)
const state = {
  accounts: [
    { accountId: 'checking', name: 'Principal', type: 'checking', currency: 'BRL', initialBalance: 1000, initialBalanceDate: '2026-01-01', includeInTotalBalance: true, archived: false },
    { accountId: 'reserve', name: 'Reserva', type: 'savings', currency: 'BRL', initialBalance: 500, initialBalanceDate: '2026-01-01', includeInTotalBalance: true, archived: true },
  ],
  cards: [{ id: 'card', name: 'Cartão', closingDay: 25, dueDay: 3 }],
  transactions: [
    { id: 'income', description: 'Receita', type: 'income', amount: 1000, status: 'received', accountId: 'checking', date: '2026-07-01', competenceMonth: 7, competenceYear: 2026 },
    { id: 'expense', description: 'Despesa', type: 'expense', amount: 200, status: 'paid', accountId: 'checking', date: '2026-07-02', competenceMonth: 7, competenceYear: 2026 },
    { id: 'card-buy', description: 'Compra', type: 'expense', amount: 120, status: 'pending', cardId: 'card', date: '2026-07-05', invoiceId: 'card-2026-08', invoiceMonth: 8, invoiceYear: 2026, installmentGroupId: 'group', installmentNumber: 1, installmentTotal: 2 },
    { id: 'installment', description: 'Compra', type: 'expense', amount: 120, status: 'pending', cardId: 'card', date: '2026-07-05', invoiceId: 'card-2026-09', invoiceMonth: 9, invoiceYear: 2026, installmentGroupId: 'group', installmentNumber: 2, installmentTotal: 2 },
    { id: 'unassigned', description: 'Sem conta', type: 'expense', amount: 30, status: 'pending', date: '2026-07-20', competenceMonth: 7, competenceYear: 2026 },
    { id: 'refund', description: 'Estorno', type: 'income', amount: 20, status: 'received', accountId: 'checking', date: '2026-07-10', competenceMonth: 7, competenceYear: 2026 },
    { id: 'rec-occ', description: 'Recorrente', type: 'expense', amount: 50, status: 'pending', accountId: 'checking', date: '2026-08-01', recurrenceId: 'rec', recurrenceOccurrenceId: 'occ', generatedFromRecurrence: true, scheduledOccurrenceDate: '2026-08-01', recurrenceType: 'expense' },
  ],
  transfers: [
    { transferId: 'done', sourceAccountId: 'checking', destinationAccountId: 'reserve', amount: 100, fee: 0, date: '2026-07-03', status: 'completed' },
    { transferId: 'scheduled', sourceAccountId: 'checking', destinationAccountId: 'reserve', amount: 50, fee: 0, date: '2026-08-03', status: 'scheduled' },
  ],
  recurrences: [{ recurrenceId: 'rec', type: 'expense', description: 'Mensal', amount: 50, frequency: 'monthly', status: 'active', startDate: '2026-08-01' }],
  alertStates: [], categories: ['Casa'], costCenters: ['Pessoal'], invoiceRecords: [], filters: {}, userSettings: { financialCycleDay: 25 }, migrations: { financeDataVersion: 4 },
}

test('cenário financeiro da Fase 0 preserva saldos, competências, faturas e patrimônio das transferências', () => {
  const report = createBaselineReport(state, { referenceDate, generatedAt: '2026-07-15T12:00:00.000Z' })
  assert.equal(report.totals.byAccount.find((item) => item.id === 'checking').balance, 1720)
  assert.equal(report.totals.global.consolidatedBalance, 1720)
  assert.equal(report.totals.global.incomeRealized, 1020)
  assert.equal(report.totals.global.expensesRealized, 200)
  assert.equal(report.totals.transfers.completed.count, 1)
  assert.equal(report.totals.transfers.scheduled.count, 1)
  assert.equal(report.counts.installmentGroups, 1)
  assert.equal(report.counts.installments, 2)
  assert.equal(report.counts.recurrences, 1)
  assert.equal(report.counts.recurrenceOccurrences, 1)
  assert.equal(report.totals.byPeriod.find((item) => item.period === '2026-08').invoices, 120)
  assert.match(report.reportChecksum, /^fnv1a-[0-9a-f]{8}$/)
})

test('checksum do cenário é estável quando a ordem das coleções muda', () => {
  const options = { referenceDate, generatedAt: '2026-07-15T12:00:00.000Z' }
  const first = createBaselineReport(state, options)
  const reordered = createBaselineReport({ ...state, transactions: [...state.transactions].reverse(), accounts: [...state.accounts].reverse() }, options)
  assert.equal(first.reportChecksum, reordered.reportChecksum)
})
