import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { buildFinanceIndexes } from '../src/domain/transactions/transactionSelectors.js'
import { filterTransactions } from '../src/utils/filtering.js'
import { buildMonthlyForecast } from '../src/utils/forecastCalculations.js'

const transactions = Array.from({ length: 5000 }, (_, index) => ({ id: `t-${index}`, description: index % 4 ? 'Mercado São João' : 'Aluguel', amount: index % 300 + 1, type: 'expense', status: index % 3 ? 'pending' : 'paid', category: index % 2 ? 'Casa' : 'Alimentação', cardId: `card-${index % 5}`, invoiceId: `invoice-${index % 12}`, invoiceMonth: index % 12 + 1, invoiceYear: 2026 + Math.floor(index / 2500), dueDate: `2026-${String(index % 12 + 1).padStart(2, '0')}-10`, installmentNumber: 1, installmentTotal: 1 }))
const cards = Array.from({ length: 5 }, (_, index) => ({ id: `card-${index}`, name: `Cartão ${index}` }))
const invoices = Array.from({ length: 12 }, (_, index) => ({ id: `invoice-${index}`, cardId: `card-${index % 5}`, invoiceMonth: index + 1, invoiceYear: 2026, status: 'open', totalPending: 0 }))

test('fase 21: índices derivados preservam grupos e evitam buscas lineares de contexto', () => {
  const indexes = buildFinanceIndexes({ transactions, cards, invoices, categories: ['Casa', 'Alimentação'] })
  assert.equal(indexes.transactionsById.size, 5000); assert.equal(indexes.cardsById.get('card-2').name, 'Cartão 2'); assert.equal(indexes.transactionsByInvoiceId.get('invoice-3').length > 0, true)
})

test('fase 21: cenário sintético de 5 mil lançamentos filtra e projeta sem alterar dados', () => {
  const indexes = buildFinanceIndexes({ transactions, cards, invoices }); const before = JSON.stringify(transactions); const started = performance.now()
  const filtered = filterTransactions(transactions, { search: 'sao joao', category: 'Casa', cardId: 'card-1', sort: 'newest' }, { cards, invoices, indexes }); const forecast = buildMonthlyForecast(transactions, invoices, 6, new Date(2026, 0, 1)); const elapsed = performance.now() - started
  assert.ok(filtered.length >= 0); assert.equal(forecast.length, 6); assert.equal(JSON.stringify(transactions), before); assert.ok(elapsed < 2000, `processamento sintético levou ${elapsed.toFixed(1)}ms`)
})
