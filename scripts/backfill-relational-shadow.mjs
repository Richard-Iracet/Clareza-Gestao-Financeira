import { createClient } from '@supabase/supabase-js'
import { createRelationalShadowRepository } from '../src/infrastructure/storage/relationalShadowRepository.js'
import { createRelationalBackfillRepository } from '../src/infrastructure/storage/relationalBackfillRepository.js'
import { runRelationalBackfill } from '../src/domain/relational/relationalBackfillService.js'
import { validateSnapshot } from '../src/utils/snapshot.js'

const args = new Set(process.argv.slice(2))
const value = (name, fallback) => { const entry = process.argv.slice(2).find((item) => item.startsWith(`${name}=`)); return entry ? entry.slice(name.length + 1) : fallback }
const target = process.env.CLAREZA_TARGET_ENV || 'development'
const dryRun = args.has('--dry-run')
if (String(process.env.CLAREZA_RELATIONAL_BACKFILL_TOOLS).toLowerCase() !== 'true') throw new Error('Defina CLAREZA_RELATIONAL_BACKFILL_TOOLS=true para habilitar explicitamente a ferramenta.')
if (target === 'production' && !args.has('--allow-production')) throw new Error('Produção recusada. Use --allow-production após backup e aprovação explícita.')
if (!dryRun && !args.has('--confirm')) throw new Error('Execução gravável exige --confirm. Prefira começar com --dry-run.')
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios fora do frontend.')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const userId = value('--user-id')
if (!userId) throw new Error('--user-id=<uuid> é obrigatório; o backfill processa um usuário por vez.')
const { data: row, error } = await client.from('finance_states').select('*').eq('user_id', userId).single()
if (error) throw error
const snapshot = row.data
if (Number(row.revision) !== Number(snapshot.revision) || row.checksum !== snapshot.checksum) throw new Error('Metadados e snapshot de finance_states divergem; backfill interrompido.')
const validation = validateSnapshot(snapshot)
if (!validation.valid) throw new Error(`Checksum/snapshot inválido: ${validation.errors.join(' ')}`)
const result = await runRelationalBackfill({ userId, snapshot, dryRun, batchSize: Number(value('--batch-size', 500)), shadowRepository: createRelationalShadowRepository(client), backfillRepository: createRelationalBackfillRepository(client), onProgress: ({ processed, total }) => process.stderr.write(`\r${processed}/${total}`) })
process.stderr.write('\n')
process.stdout.write(`${JSON.stringify({ target, dryRun, status: result.status, runId: result.runId, processedCount: result.processedCount, issueCount: result.issueCount }, null, 2)}\n`)
