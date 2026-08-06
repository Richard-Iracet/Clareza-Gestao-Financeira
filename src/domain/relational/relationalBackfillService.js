import { mapFinanceStateToRelational, RELATIONAL_TABLES } from './relationalMapper.js'

export const RELATIONAL_MIGRATION_NAME = 'jsonb-to-relational-shadow'
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size))

export const runRelationalBackfill = async ({ userId, snapshot, shadowRepository, backfillRepository, batchSize = 500, dryRun = false, onProgress = () => {} }) => {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new RangeError('batchSize deve estar entre 1 e 5000.')
  const mapped = mapFinanceStateToRelational({ userId, snapshot })
  const existing = dryRun ? null : await backfillRepository.findRun({ userId, migrationName: RELATIONAL_MIGRATION_NAME, revision: snapshot.revision, checksum: snapshot.checksum })
  if (existing?.status === 'completed') return { status: 'skipped', idempotent: true, runId: existing.id, mapped }
  let runId = existing?.id || uuid()
  const startedAt = existing?.started_at || new Date().toISOString()
  const total = Object.values(mapped.entities).reduce((sum, rows) => sum + rows.length, 0)
  if (dryRun) return { status: 'dry-run', runId, processedCount: total, issueCount: mapped.issues.length, mapped }
  const persisted = await backfillRepository.start({ id: runId, user_id: userId, migration_name: RELATIONAL_MIGRATION_NAME, migration_version: 1, status: 'running', started_at: startedAt, source_revision: snapshot.revision, source_checksum: snapshot.checksum, checkpoint: existing?.checkpoint || {}, processed_count: existing?.processed_count || 0, metadata: { mapperVersion: mapped.mapperVersion, batchSize } })
  runId = persisted.id
  let processed = Number(existing?.processed_count || 0)
  const resumeEntity = existing?.checkpoint?.entity
  const resumeOffset = Number(existing?.checkpoint?.offset || 0)
  let reachedResumeEntity = !resumeEntity
  try {
    for (const [key, table] of Object.entries(RELATIONAL_TABLES)) {
      if (!reachedResumeEntity && key !== resumeEntity) continue
      if (key === resumeEntity) reachedResumeEntity = true
      const startOffset = key === resumeEntity ? resumeOffset : 0
      const batches = chunks(mapped.entities[key].slice(startOffset), batchSize)
      for (let index = 0; index < batches.length; index += 1) {
        const result = await shadowRepository.upsertBatch(table, batches[index]); processed += result.count
        const checkpoint = { entity: key, offset: startOffset + index * batchSize + batches[index].length, batch: index + 1, batchCount: batches.length }
        await backfillRepository.checkpoint(runId, { checkpoint, processed_count: processed, updated_count: processed })
        onProgress({ processed, total, checkpoint })
      }
    }
    await backfillRepository.issues(mapped.issues.map((issue) => ({ id: uuid(), user_id: userId, migration_run_id: runId, ...issue })))
    await backfillRepository.checkpoint(runId, { status: 'completed', completed_at: new Date().toISOString(), processed_count: processed, updated_count: processed, error_count: mapped.issues.length })
    return { status: 'completed', runId, processedCount: processed, issueCount: mapped.issues.length, mapped }
  } catch (error) {
    await backfillRepository.checkpoint(runId, { status: 'failed', completed_at: new Date().toISOString(), processed_count: processed, error_count: mapped.issues.length + 1, error_summary: String(error.message).slice(0, 1000) })
    throw error
  }
}
