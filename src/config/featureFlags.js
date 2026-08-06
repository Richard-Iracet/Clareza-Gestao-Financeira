import { readAppEnvironment } from './appEnvironment.js'

export const FEATURE_FLAGS = Object.freeze({
  phase0BaselineTools: 'phase0BaselineTools', relationalShadowModel: 'relationalShadowModel', relationalBackfillTools: 'relationalBackfillTools', relationalShadowWrite: 'relationalShadowWrite', relationalShadowRead: 'relationalShadowRead', relationalEquivalenceReports: 'relationalEquivalenceReports', originIdentityLayer: 'originIdentityLayer', externalRawDataLayer: 'externalRawDataLayer', auditEvents: 'auditEvents', reversibleReconciliation: 'reversibleReconciliation', externalDataIngestion: 'externalDataIngestion', ofxCsvImport: 'ofxCsvImport', reconciliationEngine: 'reconciliationEngine', openFinanceGateway: 'openFinanceGateway', assistedOpenFinanceSync: 'assistedOpenFinanceSync', automaticOpenFinanceSync: 'automaticOpenFinanceSync', unifiedFinancialHub: 'unifiedFinancialHub', deterministicSpendingInsights: 'deterministicSpendingInsights', investmentsModule: 'investmentsModule', marketData: 'marketData', taxAssistant: 'taxAssistant', financialAI: 'financialAI', investmentAI: 'investmentAI',
})
export const DEFAULT_FEATURE_FLAGS = Object.freeze(Object.fromEntries(Object.values(FEATURE_FLAGS).map((flag) => [flag, false])))
const truthy = (value) => String(value || '').toLowerCase() === 'true'

export const resolveFeatureFlags = ({ env = import.meta.env || {}, overrides = {} } = {}) => {
  const appEnvironment = readAppEnvironment(env)
  const flags = { ...DEFAULT_FEATURE_FLAGS }
  if (appEnvironment.valid && !appEnvironment.isProduction) flags.phase0BaselineTools = truthy(env.VITE_PHASE0_BASELINE_TOOLS)
  if (appEnvironment.valid) flags.ofxCsvImport = truthy(env.VITE_OFX_CSV_IMPORT)
  Object.keys(flags).forEach((flag) => { if (typeof overrides?.[flag] === 'boolean') flags[flag] = overrides[flag] })
  if (!appEnvironment.valid || appEnvironment.isProduction) flags.phase0BaselineTools = false
  return Object.freeze(flags)
}
export const isFeatureEnabled = (flag, options) => Boolean(resolveFeatureFlags(options)[flag])
