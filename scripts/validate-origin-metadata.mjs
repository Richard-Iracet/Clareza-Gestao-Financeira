import { createClient } from '@supabase/supabase-js'
import { ORIGIN_BACKFILL_TABLES } from '../src/domain/origin/originBackfillService.js'
const option = (name) => process.argv.slice(2).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1)
const userId = option('--user-id'), url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!userId || !url || !key) throw new Error('--user-id, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), results = []
for (const table of ORIGIN_BACKFILL_TABLES) {
  const { count: total, error: totalError } = await client.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
  const { count: missing, error: missingError } = await client.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId).is('source', null)
  if (totalError || missingError) throw totalError || missingError
  results.push({ table, total, missingSource: missing })
}
process.stdout.write(`${JSON.stringify({ userId, valid: results.every((item) => item.missingSource === 0), tables: results }, null, 2)}\n`)
