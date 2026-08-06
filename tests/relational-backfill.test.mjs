import test from 'node:test'
import assert from 'node:assert/strict'
import { runRelationalBackfill } from '../src/domain/relational/relationalBackfillService.js'

const state = { accounts: [], cards: [], categories: [], costCenters: [], recurrences: [], invoiceRecords: [], transactions: Array.from({ length: 12 }, (_, i) => ({ id: `t-${i}`, amount: i })), transfers: [] }
const snapshot = { snapshotId: 's', revision: 1, checksum: 'c', data: state }
test('backfill usa lotes, checkpoints e reexecução concluída é ignorada', async () => {
  const rows = new Map(), checkpoints = []; let completed = null
  const shadowRepository = { upsertBatch: async (table, batch) => { batch.forEach((row) => rows.set(`${table}:${row.user_id}:${row.id}`, row)); return { count: batch.length } } }
  const backfillRepository = { findRun: async () => completed, start: async (run) => run, checkpoint: async (id, patch) => { checkpoints.push(patch); if (patch.status === 'completed') completed = { id, status: 'completed' } }, issues: async () => {} }
  const first = await runRelationalBackfill({ userId: 'u', snapshot, shadowRepository, backfillRepository, batchSize: 5 })
  const count = rows.size
  const second = await runRelationalBackfill({ userId: 'u', snapshot, shadowRepository, backfillRepository, batchSize: 3 })
  assert.equal(first.status, 'completed'); assert.equal(second.status, 'skipped'); assert.equal(rows.size, count)
  assert.ok(checkpoints.some((item) => item.checkpoint?.batch === 3))
})

test('dry-run não escreve', async () => {
  let writes = 0
  const result = await runRelationalBackfill({ userId: 'u', snapshot, dryRun: true, shadowRepository: { upsertBatch: async () => { writes++; return { count: 0 } } }, backfillRepository: {} })
  assert.equal(result.status, 'dry-run'); assert.equal(writes, 0)
})
