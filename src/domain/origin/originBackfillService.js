export const ORIGIN_BACKFILL_NAME = 'phase2-manual-origin-backfill'
export const ORIGIN_BACKFILL_TABLES = Object.freeze(['financial_accounts', 'payment_cards', 'credit_card_invoice_records', 'financial_transactions', 'financial_transfers', 'financial_recurrences'])
const persistentId = () => { if (!globalThis.crypto?.randomUUID) throw new Error('crypto.randomUUID é obrigatório.'); return globalThis.crypto.randomUUID() }

export const runOriginBackfill = async ({ userId, repository, batchSize = 500, dryRun = false, onProgress = () => {} }) => {
  if (!userId) throw new TypeError('userId obrigatório.')
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new RangeError('batchSize deve estar entre 1 e 5000.')
  const existing = await repository.findRun({ userId, migrationName: ORIGIN_BACKFILL_NAME })
  if (existing?.status === 'completed') return { status: 'skipped', idempotent: true, runId: existing.id, processedCount: existing.processed_count }
  const runId = existing?.id || persistentId(), resumeTable = existing?.checkpoint?.table, resumeOffset = Number(existing?.checkpoint?.offset || 0)
  let processed = Number(existing?.processed_count || 0), auditCount = 0, reachedResume = !resumeTable
  if (!dryRun) await repository.startRun({ id: runId, user_id: userId, migration_name: ORIGIN_BACKFILL_NAME, migration_version: 1, status: 'running', started_at: existing?.started_at || new Date().toISOString(), checkpoint: existing?.checkpoint || {}, processed_count: processed, metadata: { batchSize } })
  for (const table of ORIGIN_BACKFILL_TABLES) {
    if (!reachedResume && table !== resumeTable) continue
    if (table === resumeTable) reachedResume = true
    let offset = table === resumeTable ? resumeOffset : 0
    while (true) {
      const rows = await repository.listBatch({ table, userId, offset, limit: batchSize })
      if (!rows.length) break
      if (!dryRun) {
        await repository.markManual({ table, userId, ids: rows.map((row) => row.id), transactionTable: table === 'financial_transactions' })
        const events = rows.map((row) => ({ id: persistentId(), user_id: userId, entity_type: table, entity_id: row.id, event_type: 'manual_origin_backfilled', actor_type: 'migration', source: 'migration', changed_fields: table === 'financial_transactions' ? ['source', 'internal_status'] : ['source'], reason: 'Fase 2: classificação da projeção histórica', metadata: { backfill: ORIGIN_BACKFILL_NAME }, idempotency_key: `${ORIGIN_BACKFILL_NAME}:${table}:${row.id}`, occurred_at: new Date().toISOString() }))
        auditCount += await repository.appendAudit(events)
      }
      offset += rows.length; processed += rows.length
      if (!dryRun) await repository.checkpoint(runId, { checkpoint: { table, offset }, processed_count: processed, updated_count: processed })
      onProgress({ table, offset, processed })
      if (rows.length < batchSize) break
    }
  }
  if (!dryRun) await repository.checkpoint(runId, { status: 'completed', completed_at: new Date().toISOString(), processed_count: processed, updated_count: processed })
  return { status: dryRun ? 'dry-run' : 'completed', runId, processedCount: processed, auditCount }
}
