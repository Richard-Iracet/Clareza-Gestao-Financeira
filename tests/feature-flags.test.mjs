import test from 'node:test'
import assert from 'node:assert/strict'
import { FEATURE_FLAGS, isFeatureEnabled, resolveFeatureFlags } from '../src/config/featureFlags.js'
import { readAppEnvironment } from '../src/config/appEnvironment.js'

test('flags futuras e desconhecidas iniciam desligadas', () => {
  const flags = resolveFeatureFlags({ env: { VITE_APP_ENV: 'development' } })
  Object.values(FEATURE_FLAGS).forEach((flag) => assert.equal(flags[flag], false))
  assert.equal(isFeatureEnabled('unknown', { env: {} }), false)
})
test('ferramenta da fase 0 exige configuração explícita fora de produção', () => {
  assert.equal(isFeatureEnabled(FEATURE_FLAGS.phase0BaselineTools, { env: { VITE_APP_ENV: 'staging', VITE_PHASE0_BASELINE_TOOLS: 'true' } }), true)
  assert.equal(isFeatureEnabled(FEATURE_FLAGS.phase0BaselineTools, { env: { VITE_APP_ENV: 'production', VITE_PHASE0_BASELINE_TOOLS: 'true' }, overrides: { phase0BaselineTools: true } }), false)
})
test('override conhecido funciona e ambiente desconhecido é rejeitado com segurança', () => {
  assert.equal(isFeatureEnabled(FEATURE_FLAGS.marketData, { env: { VITE_APP_ENV: 'development' }, overrides: { marketData: true } }), true)
  assert.equal(readAppEnvironment({ VITE_APP_ENV: 'qa' }).valid, false)
  assert.equal(isFeatureEnabled(FEATURE_FLAGS.phase0BaselineTools, { env: { VITE_APP_ENV: 'qa', VITE_PHASE0_BASELINE_TOOLS: 'true' } }), false)
})
