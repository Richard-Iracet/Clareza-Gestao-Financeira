import test from 'node:test'
import assert from 'node:assert/strict'
import { getAvailableUntilNextIncome, getCompetenceInvoices, getDashboardCompetence, getDashboardMonthlyDetails, getFinancialCycle, getFinancialCycleSummary, getOpenInvoicesSummary, getUpcomingFinancialEvents, isDateInFinancialCycle } from '../src/domain/dashboard/dashboardSelectors.js'

const tx = (overrides = {}) => ({ id: 'tx', description: 'Item', amount: 10, type: 'expense', status: 'pending', dueDate: '2026-08-10', competenceMonth: 8, competenceYear: 2026, ...overrides })
const invoice = (overrides = {}) => ({ id: 'invoice-aug', cardId: 'card', invoiceMonth: 8, invoiceYear: 2026, dueDate: '2026-08-15', status: 'open', totalPending: 80, ...overrides })

test('dashboard usa a competência persistida e trata virada de ano', () => {
  assert.deepEqual(getDashboardCompetence({ competenceMonth: '1', competenceYear: '2027' }, new Date(2026, 11, 31)), { month: 1, year: 2027 })
})

test('faturas do mês incluem somente competência aberta e saldo pendente', () => {
  const result = getCompetenceInvoices([invoice(), invoice({ id: 'paid', status: 'paid' }), invoice({ id: 'sep', invoiceMonth: 9 })], 8, 2026)
  assert.deepEqual(result.map((item) => item.id), ['invoice-aug'])
})

test('pendente soma despesas diretas, fatura e transferência sem duplicar compra do cartão', () => {
  const result = getDashboardMonthlyDetails({
    transactions: [tx({ id: 'direct', amount: 20 }), tx({ id: 'card-purchase', cardId: 'card', invoiceId: 'invoice-aug', amount: 80 })],
    invoices: [invoice()], transfers: [{ transferId: 'transfer', status: 'scheduled', date: '2026-08-20', sourceAccountId: 'main', destinationAccountId: 'other', amount: 30, fee: 2 }], month: 8, year: 2026,
  })
  assert.equal(result.directExpensesPending, 20)
  assert.equal(result.invoicesPending, 80)
  assert.equal(result.transfersPending, 32)
  assert.equal(result.pendingTotal, 132)
})

test('resultado mensal considera apenas receitas e despesas realizadas da competência', () => {
  const result = getDashboardMonthlyDetails({ transactions: [tx({ type: 'income', status: 'received', amount: 100 }), tx({ id: 'paid', status: 'paid', amount: 35 }), tx({ id: 'future', competenceMonth: 9, status: 'paid', amount: 999 })], month: 8, year: 2026 })
  assert.equal(result.incomeRealized, 100)
  assert.equal(result.expensesRealized, 35)
  assert.equal(result.result, 65)
})

test('linha do tempo substitui compras do cartão pela fatura e ignora eventos liquidados', () => {
  const events = getUpcomingFinancialEvents({ transactions: [tx({ id: 'direct' }), tx({ id: 'purchase', cardId: 'card', invoiceId: 'invoice-aug' }), tx({ id: 'paid', status: 'paid' })], invoices: [invoice()], transfers: [], referenceDate: new Date(2026, 7, 5), cards: [{ id: 'card', name: 'Visa' }] })
  assert.deepEqual(events.map((item) => item.id), ['transaction:direct', 'invoice:invoice-aug'])
})

test('ciclo financeiro cobre dia 25, virada do ano, fevereiro e dia 31', () => {
  assert.deepEqual(getFinancialCycle(new Date(2026, 7, 5), 25), { day: 25, start: '2026-07-25', end: '2026-08-24', nextExpectedDate: '2026-08-25', previousStart: '2026-06-25', previousEnd: '2026-07-24' })
  assert.equal(getFinancialCycle(new Date(2027, 0, 2), 25).start, '2026-12-25')
  assert.equal(getFinancialCycle(new Date(2028, 1, 29), 31).start, '2028-02-29')
  assert.equal(isDateInFinancialCycle('2026-08-24', getFinancialCycle(new Date(2026, 7, 5), 25)), true)
})

test('receitas e despesas do ciclo respeitam limites, status e pagamento de fatura', () => {
  const result = getFinancialCycleSummary({ referenceDate: new Date(2026, 7, 5), cycleDay: 25, transactions: [
    tx({ id: 'income', type: 'income', status: 'received', date: '2026-07-25', amount: 1000 }),
    tx({ id: 'before', type: 'income', status: 'received', date: '2026-07-24', amount: 9000 }),
    tx({ id: 'pending-income', type: 'income', status: 'pending', date: '2026-08-01', amount: 500 }),
    tx({ id: 'cash', status: 'paid', date: '2026-08-02', amount: 100 }),
    tx({ id: 'card', status: 'paid', date: '2026-08-03', cardId: 'card', amount: 200 }),
    tx({ id: 'invoice-payment', status: 'paid', date: '2026-08-04', transactionKind: 'invoice-payment', amount: 200 }),
  ] })
  assert.equal(result.incomeTotal, 1000)
  assert.equal(result.expenseTotal, 300)
  assert.equal(result.result, 700)
  assert.deepEqual(result.expenseByOrigin.map((item) => [item.label, item.value]), [['Cartões', 200], ['Contas', 100]])
})

test('total em faturas exclui paga e mantém somente a próxima aberta de cada cartão', () => {
  const result = getOpenInvoicesSummary([invoice(), invoice({ id: 'closed', cardId: 'other', status: 'closed', totalPending: 20 }), invoice({ id: 'paid', status: 'paid' }), invoice({ id: 'future', invoiceMonth: 9, dueDate: '2026-09-15', status: 'open', totalPending: 500 })], [{ id: 'card', name: 'Visa' }, { id: 'other', name: 'Master' }])
  assert.equal(result.total, 100)
  assert.equal(result.cardCount, 2)
})

test('disponível até próximo pagamento fecha memória e separa fatura de compra', () => {
  const result = getAvailableUntilNextIncome({ referenceDate: new Date(2026, 7, 5), cycleDay: 25,
    accounts: [{ accountId: 'main', initialBalance: 1000, initialBalanceDate: '2026-01-01', includeInTotalBalance: true, archived: false }],
    transactions: [tx({ id: 'income', type: 'income', status: 'pending', dueDate: '2026-08-10', accountId: 'main', amount: 100 }), tx({ id: 'expense', status: 'pending', dueDate: '2026-08-12', accountId: 'main', amount: 50 }), tx({ id: 'purchase', status: 'pending', dueDate: '2026-08-12', cardId: 'card', amount: 300 })],
    invoices: [invoice({ totalPending: 300 })], transfers: [{ transferId: 't', status: 'scheduled', date: '2026-08-20', sourceAccountId: 'main', destinationAccountId: 'other', amount: 25 }], invoicePayments: [] })
  assert.equal(result.total, 725)
  assert.equal(result.available + result.income - result.expenses - result.invoiceTotal - result.transferTotal, result.total)
})
