import { RELATIONAL_TABLES } from '../../domain/relational/relationalMapper.js'

const check = (error, operation) => { if (error) throw new Error(`${operation}: ${error.message}`, { cause: error }) }
export const createRelationalShadowRepository = (client) => {
  if (!client) throw new TypeError('Cliente Supabase obrigatório.')
  return {
    async readUser(userId) {
      const entries = await Promise.all(Object.entries(RELATIONAL_TABLES).map(async ([key, table]) => {
        const { data, error } = await client.from(table).select('*').eq('user_id', userId)
        check(error, `Leitura de ${table}`); return [key, data || []]
      }))
      return Object.fromEntries(entries)
    },
    async upsertBatch(table, rows) {
      if (!rows.length) return { count: 0 }
      const { data, error } = await client.from(table).upsert(rows, { onConflict: 'user_id,id' }).select('id')
      check(error, `Upsert de ${table}`); return { count: data?.length ?? rows.length }
    },
  }
}
