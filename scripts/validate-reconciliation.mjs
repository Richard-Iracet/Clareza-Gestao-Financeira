import { readFile } from 'node:fs/promises'
const sql = await readFile(new URL('../supabase/migrations/008_create_reconciliation_engine_schema.sql', import.meta.url), 'utf8')
const checks = { tables: ['reconciliation_runs','reconciliation_candidates','reconciliation_rules'].every((name) => sql.includes(name)), jsonbOfficialUntouched: !/update\s+public\.finance_states|delete\s+from\s+public\.finance_states/i.test(sql), heuristicAutoMatchDisabled: sql.includes('"heuristicAutoMatch":false') }
console.log(JSON.stringify(checks, null, 2)); if (Object.values(checks).includes(false)) process.exitCode = 1
