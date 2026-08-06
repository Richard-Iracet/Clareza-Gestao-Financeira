import { createClient } from '@supabase/supabase-js'
import { createOriginBackfillRepository } from '../src/infrastructure/storage/originBackfillRepository.js'
import { runOriginBackfill } from '../src/domain/origin/originBackfillService.js'

const args = new Set(process.argv.slice(2)), option = (name, fallback) => process.argv.slice(2).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback
const target = process.env.CLAREZA_TARGET_ENV || 'development', dryRun = args.has('--dry-run')
if (String(process.env.CLAREZA_ORIGIN_BACKFILL_TOOLS).toLowerCase() !== 'true') throw new Error('Defina CLAREZA_ORIGIN_BACKFILL_TOOLS=true para habilitar a ferramenta.')
if (target === 'production' && !args.has('--allow-production')) throw new Error('Produção recusada sem --allow-production.')
if (!dryRun && !args.has('--confirm')) throw new Error('Execução gravável exige --confirm.')
const userId = option('--user-id'), url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!userId) throw new Error('--user-id=<uuid> é obrigatório.')
if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios fora do frontend.')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const result = await runOriginBackfill({ userId, repository: createOriginBackfillRepository(client), dryRun, batchSize: Number(option('--batch-size', 500)), onProgress: ({ table, processed }) => process.stderr.write(`\r${table}: ${processed}`) })
process.stderr.write('\n'); process.stdout.write(`${JSON.stringify({ target, ...result }, null, 2)}\n`)
