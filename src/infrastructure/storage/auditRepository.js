const fail = (error, action) => { if (error) throw new Error(`${action}: ${error.message}`, { cause: error }) }
export const createAuditRepository = (client) => ({
  async append(event) { const { data, error } = await client.from('audit_events').upsert(event, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }).select('*').maybeSingle(); fail(error, 'Registrar auditoria'); return data },
  async appendMany(events) { if (!events.length) return []; const { data, error } = await client.from('audit_events').upsert(events, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }).select('*'); fail(error, 'Registrar auditoria'); return data || [] },
})
