const fail = (error, action) => { if (error) throw new Error(`${action}: ${error.message}`, { cause: error }) }
export const createOriginBackfillRepository = (client) => ({
  async findRun({ userId, migrationName }) { const { data, error } = await client.from('migration_runs').select('*').eq('user_id', userId).eq('migration_name', migrationName).order('started_at', { ascending: false }).limit(1).maybeSingle(); fail(error, 'Consultar backfill'); return data },
  async startRun(row) { const { data, error } = await client.from('migration_runs').upsert(row).select('*').single(); fail(error, 'Iniciar backfill'); return data },
  async listBatch({ table, userId, offset, limit }) { const columns = table === 'financial_transactions' ? 'id,source,internal_status' : 'id,source'; const { data, error } = await client.from(table).select(columns).eq('user_id', userId).order('id').range(offset, offset + limit - 1); fail(error, `Ler ${table}`); return data || [] },
  async markManual({ table, userId, ids, transactionTable }) { if (!ids.length) return; const patch = transactionTable ? { source: 'manual', internal_status: 'active' } : { source: 'manual' }; const { error } = await client.from(table).update(patch).eq('user_id', userId).in('id', ids); fail(error, `Atualizar ${table}`) },
  async appendAudit(events) { if (!events.length) return 0; const { data, error } = await client.from('audit_events').upsert(events, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }).select('id'); fail(error, 'Auditoria do backfill'); return data?.length || 0 },
  async checkpoint(id, patch) { const { error } = await client.from('migration_runs').update(patch).eq('id', id); fail(error, 'Checkpoint do backfill') },
})
