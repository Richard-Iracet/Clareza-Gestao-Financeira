import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('migration aplica RLS forçada, revoga anon e restringe por auth.uid', async () => {
  const sql = await readFile(new URL('../supabase/migrations/003_relational_shadow_rls.sql', import.meta.url), 'utf8')
  assert.match(sql, /force row level security/i); assert.match(sql, /revoke all .* anon/i); assert.match(sql, /auth\.uid\(\).*user_id/i)
  assert.doesNotMatch(sql, /security definer/i)
})

test('schema preserva finance_states e update_finance_state', async () => {
  const sql = await readFile(new URL('../supabase/migrations/002_create_relational_shadow_schema.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(sql, /drop\s+(table|column).*finance_states/i); assert.doesNotMatch(sql, /update_finance_state/i)
  assert.doesNotMatch(sql, /\b(real|double precision|float)\b/i)
  assert.match(sql, /numeric\(18,2\)/i); assert.match(sql, /primary key \(user_id, id\)/i)
})
