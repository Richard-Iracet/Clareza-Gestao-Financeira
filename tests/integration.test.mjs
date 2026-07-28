import test from 'node:test'
import assert from 'node:assert/strict'
import { createRemainingCardInstallments, buildInvoices } from '../src/utils/invoiceCalculations.js'
import { appendInvoicePayment, reopenInvoiceRecord } from '../src/utils/invoiceReconciliation.js'
import { createBackup, importBackup } from '../src/utils/backup.js'
import { createSnapshot } from '../src/utils/snapshot.js'
import { loadFinanceState, saveFinanceSnapshot } from '../src/infrastructure/storage/financeRepository.js'
import { deleteTransactionByScope } from '../src/domain/transactions/transactionService.js'
import { createCard, createFinanceState, createTransaction } from './factories/financeFactory.mjs'
import { MemoryStorage } from './helpers/memoryStorage.mjs'

test('fase 23: parcelamento, exclusão por escopo, persistência e recarga preservam integridade', () => {
  const card = createCard(); const generated = createRemainingCardInstallments(createTransaction({ id: 'purchase', cardId: card.id, paymentMethod: 'Crédito', amount: 100, date: '2026-08-01', invoiceMonth: 8, invoiceYear: 2026, installmentNumber: 1, installmentTotal: 3 }), card)
  assert.deepEqual(generated.map((item) => item.installmentNumber), [1, 2, 3]); assert.equal(new Set(generated.map((item) => item.installmentGroupId)).size, 1)
  const remaining = deleteTransactionByScope(generated, generated[1].id, 'future'); assert.deepEqual(remaining.map((item) => item.installmentNumber), [1])
  const backend = new MemoryStorage(); const state = createFinanceState({ transactions: remaining, cards: [card] }); assert.equal(saveFinanceSnapshot(createSnapshot(state, { revision: 1 }), backend).success, true)
  const reloaded = loadFinanceState(backend, null); assert.equal(reloaded.source, 'current'); assert.deepEqual(reloaded.snapshot.data.transactions.map((item) => item.id), remaining.map((item) => item.id))
})

test('fase 23: fatura paga e reaberta preserva histórico, saldo e snapshot', () => {
  const card = createCard(); const items = createRemainingCardInstallments(createTransaction({ cardId: card.id, paymentMethod: 'Crédito', amount: 75, invoiceMonth: 8, invoiceYear: 2026 }), card); const invoice = buildInvoices(items, [card])[0]
  const paidRecord = appendInvoicePayment({}, invoice, '2026-08-03T12:00:00.000Z'); const paidItems = items.map((item) => ({ ...item, status: 'paid', paidAt: paidRecord.paidAt })); const paidInvoice = buildInvoices(paidItems, [card], [paidRecord])[0]
  const reopened = reopenInvoiceRecord(paidRecord, paidInvoice, 'new-purchase', '2026-08-04T12:00:00.000Z'); assert.equal(reopened.paymentHistory.length, 1); assert.equal(reopened.reopenHistory.length, 1); assert.notEqual(reopened.status, 'paid')
  const backend = new MemoryStorage(); assert.equal(saveFinanceSnapshot(createSnapshot(createFinanceState({ transactions: paidItems, cards: [card], invoiceRecords: [reopened] }), { revision: 2 }), backend).success, true); assert.equal(loadFinanceState(backend, null).snapshot.data.invoiceRecords[0].reopenHistory.length, 1)
})

test('fase 23: backup e importação restauram IDs e valores após alteração transitória', () => {
  const backend = new MemoryStorage(); const state = createFinanceState(); saveFinanceSnapshot(createSnapshot(state, { revision: 1 }), backend); const backup = createBackup(backend, { transactions: state.transactions, cards: state.cards, categories: state.categories, invoicePayments: state.invoiceRecords, filters: state.filters })
  const changed = createFinanceState({ transactions: [createTransaction({ id: 'changed', amount: 999 })] }); saveFinanceSnapshot(createSnapshot(changed, { revision: 2 }), backend); assert.equal(importBackup(backup, backend).success, true)
  const restored = loadFinanceState(backend, null).snapshot.data; assert.equal(restored.transactions[0].id, 'transaction-1'); assert.equal(restored.transactions[0].amount, 100)
})
