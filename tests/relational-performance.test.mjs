import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { mapFinanceStateToRelational } from '../src/domain/relational/relationalMapper.js'

test('mapper processa fixture sintética mínima da Fase 1', () => {
  const accounts = Array.from({ length: 20 }, (_, i) => ({ accountId: `a-${i}`, name: `Conta ${i}` }))
  const cards = Array.from({ length: 20 }, (_, i) => ({ id: `c-${i}`, name: `Cartão ${i}` }))
  const data = { accounts, cards, categories: ['Categoria'], costCenters: ['Centro'], invoiceRecords: Array.from({ length: 500 }, (_, i) => ({ id: `i-${i}`, cardId: `c-${i % 20}` })), recurrences: Array.from({ length: 500 }, (_, i) => ({ recurrenceId: `r-${i}`, type: 'expense' })), transactions: Array.from({ length: 10000 }, (_, i) => ({ id: `t-${i}`, amount: i / 100, accountId: `a-${i % 20}`, category: 'Categoria', date: '2026-08-01' })), transfers: Array.from({ length: 2000 }, (_, i) => ({ transferId: `x-${i}`, amount: 1, sourceAccountId: `a-${i % 20}`, destinationAccountId: `a-${(i + 1) % 20}` })) }
  const before = process.memoryUsage().heapUsed, start = performance.now()
  const result = mapFinanceStateToRelational({ userId: 'u', snapshot: { snapshotId: 's', revision: 1, checksum: 'c', data } })
  const elapsedMs = performance.now() - start, heapDeltaBytes = process.memoryUsage().heapUsed - before
  assert.equal(result.entities.transactions.length, 10000); assert.equal(result.entities.transfers.length, 2000)
  assert.ok(elapsedMs < 5000, `mapping levou ${elapsedMs}ms`); assert.ok(heapDeltaBytes < 256 * 1024 * 1024, `heap cresceu ${heapDeltaBytes} bytes`)
})
