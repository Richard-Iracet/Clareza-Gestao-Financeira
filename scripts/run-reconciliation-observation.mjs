import { createClient } from '@supabase/supabase-js'
import { runReconciliationEngine } from '../src/domain/reconciliation/reconciliationEngine.js'
import { createReconciliationEngineRepository } from '../src/infrastructure/storage/reconciliationEngineRepository.js'

const required = (name) => { if (!process.env[name]) throw new Error(`${name} é obrigatório.`); return process.env[name] }
const userId = required('RECONCILIATION_USER_ID'), client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const rawResult = await client.from('raw_transactions').select('*, raw_transaction_versions(*)').eq('user_id', userId).is('deleted_at', null).limit(1000)
const financialResult = await client.from('financial_transactions').select('*').eq('user_id', userId).is('deleted_at', null).limit(5000)
if (rawResult.error || financialResult.error) throw rawResult.error || financialResult.error
const rawTransactions = rawResult.data.map((item) => ({ ...item, ...(item.raw_transaction_versions || []).find((version) => version.id === item.current_version_id) }))
const result = runReconciliationEngine({ userId, rawTransactions, financialTransactions: financialResult.data, config: { mode: 'observation', exactAutoMatch: false } })
const repository = createReconciliationEngineRepository(client)
if (process.env.RECONCILIATION_REPROCESS === 'true') {
  const old = await client.from('reconciliation_candidates').select('id').eq('user_id', userId).is('superseded_at', null).limit(5000)
  if (old.error) throw old.error
  await repository.supersedeCandidates({ userId, ids: old.data.map((item) => item.id) })
}
await repository.saveRun(result.run); await repository.saveCandidates(result.candidates)
console.log(JSON.stringify(result.run.stats, null, 2))
