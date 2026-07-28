import test from 'node:test'
import assert from 'node:assert/strict'
import { initialCards } from '../src/data/cards.js'
import { buildInvoices, calculateInvoiceStatus, createCardInstallments, createRemainingCardInstallments, getInvoiceDates, getInvoicePeriod } from '../src/utils/invoiceCalculations.js'
import { FINANCE_DATA_VERSION, migrateLegacyTransactions, projectRemainingLegacyInstallments, runInvoiceMigration } from '../src/utils/invoiceMigration.js'
import { calculateSummary } from '../src/utils/calculations.js'

const nubank = initialCards.find((card) => card.id === 'nubank')
const itau = initialCards.find((card) => card.id === 'itau')
const legacy = (overrides = {}) => ({ id: 'old-1', description: 'Compra antiga', amount: 180, type: 'expense', account: 'Nubank', date: '2026-07-28', dueDate: '2026-08-03', status: 'pending', installment: '1/3', ...overrides })

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)) }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
}

test('lançamentos antigos Nubank e Itaú com vencimento em agosto permanecem em agosto/2026', () => {
  const result = migrateLegacyTransactions([legacy(), legacy({ id: 'old-2', account: 'Itaú', dueDate: '2026-08-20' })], initialCards)
  assert.deepEqual(result.map((item) => [item.cardId, item.invoiceMonth, item.invoiceYear, item.invoiceAssignmentMode]), [['nubank', 8, 2026, 'legacy-fixed'], ['itau', 8, 2026, 'legacy-fixed']])
})

test('migração v4 executa uma vez, cria backup e não duplica nem altera valores existentes', () => {
  const source = [legacy({ installment: '1/1' }), legacy({ id: 'old-2', description: 'Outra', amount: 99.9, installment: '1/1' })]
  global.localStorage = new MemoryStorage({ 'clareza:transactions': JSON.stringify(source), 'clareza:cards': JSON.stringify(initialCards) })
  const first = runInvoiceMigration([], initialCards)
  const second = runInvoiceMigration([], initialCards)
  assert.equal(first.migrated, true)
  assert.equal(second.migrated, false)
  assert.equal(second.transactions.length, source.length)
  assert.deepEqual(second.transactions.map((item) => item.amount), source.map((item) => item.amount))
  assert.ok(localStorage.getItem('financeDataBackupBeforeInvoiceMigration'))
  assert.ok(localStorage.getItem('financeDataBackupBeforeInstallmentProjectionV4'))
  assert.equal(JSON.parse(localStorage.getItem('financeDataVersion')), FINANCE_DATA_VERSION)
})

test('parcelamento antigo 2/3 preserva a atual e projeta somente 3/3', () => {
  const migrated = migrateLegacyTransactions([legacy({ invoiceId: 'nubank-2026-08', invoiceMonth: 8, invoiceYear: 2026, installment: '2/3', amount: 100 })], initialCards)
  const result = projectRemainingLegacyInstallments(migrated, initialCards)
  assert.deepEqual(result.map((item) => item.installmentNumber), [2, 3])
  assert.deepEqual(result.map((item) => item.invoiceId), ['nubank-2026-08', 'nubank-2026-09'])
  assert.ok(result.every((item) => item.amount === 100))
})

test('Nubank usa o mês do vencimento e respeita o fechamento em 24, 25 e 26 de julho', () => {
  assert.deepEqual(getInvoicePeriod('2026-07-24', nubank), { invoiceMonth: 8, invoiceYear: 2026 })
  assert.deepEqual(getInvoicePeriod('2026-07-25', nubank), { invoiceMonth: 8, invoiceYear: 2026 })
  assert.deepEqual(getInvoicePeriod('2026-07-26', nubank), { invoiceMonth: 9, invoiceYear: 2026 })
})

test('datas da fatura Nubank de agosto são 25/07 e 03/08', () => {
  assert.deepEqual(getInvoiceDates(nubank, 2026, 8), { closingDate: '2026-07-25', dueDate: '2026-08-03' })
})

test('compra após fechamento de dezembro avança corretamente para janeiro', () => {
  assert.deepEqual(getInvoicePeriod('2026-12-11', itau), { invoiceMonth: 1, invoiceYear: 2027 })
})

test('nova compra Nubank parcelada distribui valores e competências sem erro de centavos', () => {
  const parts = createCardInstallments({ description: 'Compra', amount: 600, date: '2026-07-24', installments: 3, type: 'expense' }, nubank)
  assert.deepEqual(parts.map((item) => item.invoiceId), ['nubank-2026-08', 'nubank-2026-09', 'nubank-2026-10'])
  assert.deepEqual(parts.map((item) => item.installmentNumber), [1, 2, 3])
  assert.equal(parts.reduce((sum, item) => sum + item.installmentAmount, 0), 600)
  assert.ok(parts.every((item) => item.invoiceAssignmentMode === 'automatic'))
})

test('pagar agosto afeta somente parcelas de agosto e não cria lançamento', () => {
  const parts = createCardInstallments({ description: 'Compra', amount: 300, date: '2026-07-24', installments: 3, type: 'expense', status: 'pending' }, nubank)
  const count = parts.length
  const paid = parts.map((item) => item.invoiceId === 'nubank-2026-08' ? { ...item, status: 'paid' } : item)
  assert.equal(paid.length, count)
  assert.equal(paid[0].status, 'paid')
  assert.equal(paid[1].status, 'pending')
  assert.equal(paid[2].status, 'pending')
})

test('total de cada fatura é exatamente a soma de suas parcelas, sem duplicação', () => {
  const parts = createCardInstallments({ description: 'Compra', amount: 100, date: '2026-07-24', installments: 3, type: 'expense' }, nubank)
  const invoices = buildInvoices(parts, initialCards, [])
  assert.equal(invoices.reduce((sum, invoice) => sum + invoice.total, 0), 100)
  invoices.forEach((invoice) => assert.equal(invoice.total, invoice.transactions.reduce((sum, item) => sum + item.amount, 0)))
})

test('datas personalizadas têm prioridade e podem voltar ao padrão', () => {
  assert.deepEqual(getInvoiceDates(nubank, 2026, 8, { customClosingDate: '2026-07-24', customDueDate: '2026-08-05' }), { closingDate: '2026-07-24', dueDate: '2026-08-05' })
  assert.deepEqual(getInvoiceDates(nubank, 2026, 8, { customClosingDate: null, customDueDate: null }), { closingDate: '2026-07-25', dueDate: '2026-08-03' })
})

test('status aberta, fechada, vencida e paga respeitam datas locais e pagamento definitivo', () => {
  const today = new Date(2026, 6, 21)
  assert.equal(calculateInvoiceStatus({ closingDate: '2026-07-25', dueDate: '2026-08-03' }, today), 'open')
  assert.equal(calculateInvoiceStatus({ closingDate: '2026-07-15', dueDate: '2026-08-03' }, today), 'closed')
  assert.equal(calculateInvoiceStatus({ closingDate: '2026-06-25', dueDate: '2026-07-03' }, today), 'overdue')
  assert.equal(calculateInvoiceStatus({ closingDate: '2026-06-25', dueDate: '2026-07-03', status: 'paid' }, today), 'paid')
})

test('dashboard usa somente lançamentos individuais e separa pago de pendente', () => {
  const transactions = [{ type: 'income', status: 'paid', amount: 1000 }, { type: 'expense', status: 'paid', amount: 200, necessity: 'essential' }, { type: 'expense', status: 'pending', amount: 300, necessity: 'important' }]
  const summary = calculateSummary(transactions)
  assert.equal(summary.balance, 800)
  assert.equal(summary.expenses, 200)
  assert.equal(summary.pending, 300)
})

test('cadastro 2/3 em agosto gera somente 2/3 e 3/3 com R$ 100 por parcela', () => {
  const parts = createRemainingCardInstallments({ description: 'Em andamento', amount: 100, date: '2026-07-24', installmentNumber: 2, installmentTotal: 3, installmentValueType: 'installment', invoiceMonth: 8, invoiceYear: 2026, type: 'expense' }, nubank)
  assert.deepEqual(parts.map((item) => [item.installment, item.invoiceMonth, item.invoiceYear, item.amount]), [['2/3', 8, 2026, 100], ['3/3', 9, 2026, 100]])
  assert.deepEqual(parts.map((item) => item.dueDate), ['2026-08-03', '2026-09-03'])
  assert.equal(new Set(parts.map((item) => item.installmentGroupId)).size, 1)
})

test('cadastro 5/12 em agosto projeta até março de 2027 sem parcelas anteriores', () => {
  const parts = createRemainingCardInstallments({ description: 'Longo', amount: 100, date: '2026-07-24', installmentNumber: 5, installmentTotal: 12, installmentValueType: 'installment', invoiceMonth: 8, invoiceYear: 2026, type: 'expense' }, nubank)
  assert.deepEqual(parts.map((item) => item.installmentNumber), [5, 6, 7, 8, 9, 10, 11, 12])
  assert.deepEqual(parts.at(-1) && [parts.at(-1).invoiceMonth, parts.at(-1).invoiceYear], [3, 2027])
  assert.ok(parts.every((item) => item.amount === 100))
})

test('projeção v4 reconhece parcelas futuras existentes e é idempotente', () => {
  const base = migrateLegacyTransactions([legacy({ installment: '2/3', amount: 100 })], initialCards)
  const first = projectRemainingLegacyInstallments(base, initialCards)
  const second = projectRemainingLegacyInstallments(first, initialCards)
  assert.equal(first.length, 2)
  assert.equal(second.length, 2)
})

test('filtro de setembro encontra a parcela futura pela competência da fatura', () => {
  const parts = createRemainingCardInstallments({ description: 'Busca', amount: 100, date: '2026-07-24', installmentNumber: 2, installmentTotal: 3, installmentValueType: 'installment', invoiceMonth: 8, invoiceYear: 2026, type: 'expense' }, nubank)
  const september = parts.filter((item) => item.invoiceMonth === 9 && item.invoiceYear === 2026)
  assert.equal(september.length, 1)
  assert.equal(september[0].installment, '3/3')
})

test('parcela futura aparece em faturas e na previsão financeira', () => {
  const parts = createRemainingCardInstallments({ description: 'Previsão', amount: 100, date: '2026-07-24', installmentNumber: 2, installmentTotal: 3, installmentValueType: 'installment', invoiceMonth: 8, invoiceYear: 2026, type: 'expense' }, nubank)
  const invoices = buildInvoices(parts, initialCards, [])
  assert.ok(invoices.some((invoice) => invoice.id === 'nubank-2026-09' && invoice.total === 100))
  assert.equal(calculateSummary(parts).pending, 200)
})
