import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('migrations são expand-only, versionadas, indexadas e com RLS por usuário', async () => {
  const schema = await text('supabase/migrations/006_create_import_review_schema.sql'), rls = await text('supabase/migrations/007_import_review_rls.sql')
  assert.match(schema, /create table if not exists public\.import_batches/); assert.match(schema, /create table if not exists public\.import_batch_records/); assert.match(schema, /file-import-review/)
  assert.match(schema, /file_hash/); assert.match(schema, /import_batches_file_context_uidx/); assert.match(schema, /numeric\(18,2\)/); assert.doesNotMatch(schema, /\b(real|float|double precision)\b/i)
  assert.doesNotMatch(schema, /(drop table|truncate|delete from|trigger).*finance_states/is); assert.doesNotMatch(schema, /financial_transactions.*insert/is)
  assert.match(rls, /force row level security/i); assert.match(rls, /revoke all .* anon/i); assert.match(rls, /auth\.uid\(\).*user_id/i); assert.doesNotMatch(rls, /using\s*\(\s*true\s*\)/i); assert.doesNotMatch(rls, /grant .*delete/i)
  assert.match(rls, /grant update \(normalized_payload/); assert.doesNotMatch(rls, /grant update \([^)]*raw_payload/i)
})
test('rota, menu e operação são guardados pela flag e não escrevem fonte oficial', async () => {
  const app = await text('src/App.jsx'), sidebar = await text('src/components/Layout/Sidebar.jsx'), page = await text('src/pages/ImportsPage.jsx'), service = await text('src/domain/import/importBatchService.js')
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/ImportsPage"\)\)/); assert.match(app, /FeatureFlagGuard/); assert.match(sidebar, /FEATURE_FLAGS\.ofxCsvImport/); assert.match(service, /assertImportEnabled\(enabled\)/)
  for (const source of [page, service]) { assert.doesNotMatch(source, /finance_states/); assert.doesNotMatch(source, /financial_transactions/); assert.doesNotMatch(source, /update_finance_state/) }
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/)
})
