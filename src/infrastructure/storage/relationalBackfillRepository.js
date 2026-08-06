const check = (error, operation) => { if (error) throw new Error(`${operation}: ${error.message}`, { cause: error }) }
export const createRelationalBackfillRepository = (client) => ({
  async findRun({ userId, migrationName, revision, checksum }) {
    const { data, error } = await client.from('migration_runs').select('*').eq('user_id', userId).eq('migration_name', migrationName).eq('source_revision', revision).eq('source_checksum', checksum).maybeSingle()
    check(error, 'Consulta de execução'); return data
  },
  async start(run) { const { data, error } = await client.from('migration_runs').upsert(run, { onConflict: 'user_id,migration_name,source_revision,source_checksum' }).select('*').single(); check(error, 'Início do backfill'); return data },
  async checkpoint(id, patch) { const { error } = await client.from('migration_runs').update(patch).eq('id', id); check(error, 'Checkpoint do backfill') },
  async issues(rows) { if (!rows.length) return; const { error } = await client.from('migration_issues').insert(rows); check(error, 'Registro de inconsistências') },
})
