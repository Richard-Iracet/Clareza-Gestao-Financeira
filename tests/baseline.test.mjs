import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaselineReport } from '../src/domain/baseline/baselineReport.js'
import { compareBaselineReports } from '../src/domain/baseline/financialInvariants.js'
import { anonymizeFinanceData } from '../src/utils/anonymizeFinanceData.js'

const state = { accounts: [{ accountId: 'a', name: 'Conta real', type: 'checking', currency: 'BRL', initialBalance: 1000, initialBalanceDate: '2026-01-01' }], transactions: [{ id: 'r', description: 'Salário', type: 'income', amount: 500, status: 'received', accountId: 'a', date: '2026-07-01', competenceMonth: 7, competenceYear: 2026 }, { id: 'd', description: 'Conta', type: 'expense', amount: 100, status: 'paid', accountId: 'a', date: '2026-07-02', competenceMonth: 7, competenceYear: 2026 }], cards: [], transfers: [], recurrences: [], alertStates: [], categories: ['Casa'], costCenters: ['Pessoal'], invoiceRecords: [], filters: {}, userSettings: {}, migrations: { financeDataVersion: 4 } }
const options = { referenceDate: new Date(2026, 6, 15), generatedAt: '2026-07-15T12:00:00.000Z' }
state.accounts[0].includeInTotalBalance = true
state.accounts[0].archived = false

test('relatório-base é determinístico, puro e contém totais por entidade/período', () => {
  const before = JSON.stringify(state); const first = createBaselineReport(state, options); const second = createBaselineReport({ ...state, categories: [...state.categories].reverse() }, options)
  assert.equal(first.reportChecksum, second.reportChecksum); assert.equal(first.totals.global.consolidatedBalance, 1400); assert.equal(first.totals.byPeriod[0].result, 400); assert.equal(first.totals.byAccount[0].id, 'a'); assert.equal(JSON.stringify(state), before)
})
test('comparador informa divergência sem corrigir relatórios', () => {
  const previous = createBaselineReport(state, options); const next = createBaselineReport({ ...state, transactions: state.transactions.map((item) => item.id === 'd' ? { ...item, amount: 120 } : item) }, options); const result = compareBaselineReports(previous, next)
  assert.equal(result.equal, false); assert.ok(result.differences.some((item) => item.monetaryDifference !== 0)); assert.equal(previous.totals.global.consolidatedBalance, 1400)
})
test('anonimização cria cópia, preserva IDs e transforma valores deterministicamente', () => {
  const result = anonymizeFinanceData(state, { amountFactor: 2 }); assert.equal(result.data.accounts[0].accountId, 'a'); assert.notEqual(result.data.accounts[0].name, state.accounts[0].name); assert.equal(result.data.transactions[0].amount, 1000); assert.equal(state.transactions[0].amount, 500)
})
