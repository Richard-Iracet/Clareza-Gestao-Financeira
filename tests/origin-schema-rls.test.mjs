import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

test('schema da Fase 2 é expand-only, versionado e não toca o JSONB oficial', async () => {
  const sql = await read('004_create_origin_identity_audit_schema.sql')
  for (const table of ['external_sources','external_accounts','raw_transactions','raw_transaction_versions','transaction_links','audit_events','reconciliation_decisions']) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(sql, /origin-identity-audit/); assert.match(sql, /numeric\(18,2\)/i); assert.doesNotMatch(sql, /\b(real|float|double precision)\b/i)
  assert.doesNotMatch(sql, /(drop table|truncate|delete from|trigger).*finance_states/is); assert.doesNotMatch(sql, /update_finance_state/i)
  assert.match(sql, /unique \(user_id, raw_transaction_id, payload_hash\)/); assert.match(sql, /transaction_links_active_uidx/)
})
test('RLS isola por usuário e mantém versões/auditoria append-only', async () => {
  const sql = await read('005_origin_identity_audit_rls.sql')
  assert.match(sql, /force row level security/i); assert.match(sql, /revoke all .* anon/i); assert.match(sql, /auth\.uid\(\).*user_id/i)
  assert.match(sql, /grant select, insert on table public\.audit_events/i); assert.match(sql, /grant select, insert on table public\.raw_transaction_versions/i)
  assert.doesNotMatch(sql, /grant .*update.*audit_events/i); assert.doesNotMatch(sql, /grant .*update.*raw_transaction_versions/i)
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i); assert.doesNotMatch(sql, /security definer/i); assert.doesNotMatch(sql, /grant .*delete/i)
})
