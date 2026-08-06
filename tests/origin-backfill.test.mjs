import test from 'node:test'
import assert from 'node:assert/strict'
import { runOriginBackfill, ORIGIN_BACKFILL_TABLES } from '../src/domain/origin/originBackfillService.js'

const makeRepository = () => {
  const data = Object.fromEntries(ORIGIN_BACKFILL_TABLES.map((table) => [table, Array.from({ length: 3 }, (_, i) => ({ id: `${table}-${i}`, amount: i + 0.25, description: `Item ${i}` }))]))
  const audits = new Map(), checkpoints = []; let run = null
  return { data, audits, checkpoints,
    findRun: async () => run, startRun: async (row) => { run = row; return row },
    listBatch: async ({ table, offset, limit }) => data[table].slice(offset, offset + limit),
    markManual: async ({ table, ids, transactionTable }) => data[table].forEach((row) => { if (ids.includes(row.id)) { row.source = 'manual'; if (transactionTable) row.internal_status = 'active' } }),
    appendAudit: async (events) => { let inserted = 0; events.forEach((event) => { if (!audits.has(event.idempotency_key)) { audits.set(event.idempotency_key, event); inserted++ } }); return inserted },
    checkpoint: async (id, patch) => { checkpoints.push(patch); run = { ...run, ...patch, id }; },
  }
}
test('backfill manual é loteado, mantém valores e reexecução não duplica auditoria', async () => {
  const repository = makeRepository(), before = structuredClone(repository.data)
  const first = await runOriginBackfill({ userId: 'u', repository, batchSize: 2 })
  const second = await runOriginBackfill({ userId: 'u', repository, batchSize: 1 })
  assert.equal(first.status, 'completed'); assert.equal(second.status, 'skipped'); assert.equal(repository.audits.size, ORIGIN_BACKFILL_TABLES.length * 3)
  ORIGIN_BACKFILL_TABLES.forEach((table) => repository.data[table].forEach((row, i) => { assert.equal(row.amount, before[table][i].amount); assert.equal(row.description, before[table][i].description); assert.equal(row.source, 'manual') }))
  assert.ok(repository.checkpoints.some((item) => item.checkpoint?.offset === 2))
})
test('dry-run não escreve', async () => {
  const repository = makeRepository(), before = structuredClone(repository.data)
  const result = await runOriginBackfill({ userId: 'u', repository, batchSize: 2, dryRun: true })
  assert.equal(result.status, 'dry-run'); assert.deepEqual(repository.data, before); assert.equal(repository.audits.size, 0); assert.equal(repository.checkpoints.length, 0)
})
