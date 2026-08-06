import { readAppEnvironment } from './appEnvironment.js'

export const FEATURE_FLAGS = Object.freeze({
  phase0BaselineTools: 'phase0BaselineTools', relationalShadowModel: 'relationalShadowModel', relationalBackfillTools: 'relationalBackfillTools', relationalShadowWrite: 'relationalShadowWrite', relationalShadowRead: 'relationalShadowRead', relationalEquivalenceReports: 'relationalEquivalenceReports', originIdentityLayer: 'originIdentityLayer', externalRawDataLayer: 'externalRawDataLayer', auditEvents: 'auditEvents', reversibleReconciliation: 'reversibleReconciliation', externalDataIngestion: 'externalDataIngestion', ofxCsvImport: 'ofxCsvImport', reconciliationEngine: 'reconciliationEngine', reconciliationObservationMode: 'reconciliationObservationMode', reconciliationReview: 'reconciliationReview', reconciliationExactAutoMatch: 'reconciliationExactAutoMatch', reconciliationRules: 'reconciliationRules', financialEventClassifier: 'financialEventClassifier', financialRulesShadowMode: 'financialRulesShadowMode', invoiceSettlementRules: 'invoiceSettlementRules', internalTransferRules: 'internalTransferRules', reversalRules: 'reversalRules', financialRulesComparison: 'financialRulesComparison', financialRulesOfficialRead: 'financialRulesOfficialRead', openFinanceGateway: 'openFinanceGateway', openFinanceConnections: 'openFinanceConnections', openFinanceMockProvider: 'openFinanceMockProvider', openFinanceSandbox: 'openFinanceSandbox', openFinanceWebhooks: 'openFinanceWebhooks', openFinanceOfficialSync: 'openFinanceOfficialSync', assistedOpenFinanceSync: 'assistedOpenFinanceSync', automaticOpenFinanceSync: 'automaticOpenFinanceSync', openFinanceAssistedSync:'openFinanceAssistedSync',openFinanceRealConnection:'openFinanceRealConnection',openFinanceThirtyDayPilot:'openFinanceThirtyDayPilot',openFinanceSyncReview:'openFinanceSyncReview',openFinanceManualPublish:'openFinanceManualPublish',openFinanceHistoricalExpansion:'openFinanceHistoricalExpansion',openFinanceAutomaticSync:'openFinanceAutomaticSync', unifiedFinancialHub: 'unifiedFinancialHub', deterministicSpendingInsights: 'deterministicSpendingInsights', investmentsModule: 'investmentsModule', marketData: 'marketData', taxAssistant: 'taxAssistant', financialAI: 'financialAI', investmentAI: 'investmentAI',
})
export const DEFAULT_FEATURE_FLAGS = Object.freeze(Object.fromEntries(Object.values(FEATURE_FLAGS).map((flag) => [flag, false])))
const truthy = (value) => String(value || '').toLowerCase() === 'true'

export const resolveFeatureFlags = ({ env = import.meta.env || {}, overrides = {} } = {}) => {
  const appEnvironment = readAppEnvironment(env)
  const flags = { ...DEFAULT_FEATURE_FLAGS }
  if (appEnvironment.valid && !appEnvironment.isProduction) flags.phase0BaselineTools = truthy(env.VITE_PHASE0_BASELINE_TOOLS)
  if (appEnvironment.valid) flags.ofxCsvImport = truthy(env.VITE_OFX_CSV_IMPORT)
  if (appEnvironment.valid) {
    flags.reconciliationEngine = truthy(env.VITE_RECONCILIATION_ENGINE)
    flags.reconciliationObservationMode = flags.reconciliationEngine && truthy(env.VITE_RECONCILIATION_OBSERVATION)
    flags.reconciliationReview = flags.reconciliationEngine && truthy(env.VITE_RECONCILIATION_REVIEW)
    flags.reconciliationExactAutoMatch = flags.reconciliationEngine && truthy(env.VITE_RECONCILIATION_EXACT_AUTO_MATCH)
    flags.reconciliationRules = flags.reconciliationEngine && truthy(env.VITE_RECONCILIATION_RULES)
  }
  if (appEnvironment.valid) {
    flags.financialEventClassifier = truthy(env.VITE_FINANCIAL_EVENT_CLASSIFIER)
    flags.financialRulesShadowMode = flags.financialEventClassifier && truthy(env.VITE_FINANCIAL_RULES_SHADOW_MODE)
    flags.invoiceSettlementRules = flags.financialEventClassifier && truthy(env.VITE_INVOICE_SETTLEMENT_RULES)
    flags.internalTransferRules = flags.financialEventClassifier && truthy(env.VITE_INTERNAL_TRANSFER_RULES)
    flags.reversalRules = flags.financialEventClassifier && truthy(env.VITE_REVERSAL_RULES)
    flags.financialRulesComparison = flags.financialEventClassifier && truthy(env.VITE_FINANCIAL_RULES_COMPARISON)
    flags.financialRulesOfficialRead = false
  }
  if (appEnvironment.valid) {
    flags.openFinanceGateway = truthy(env.VITE_OPEN_FINANCE_GATEWAY)
    flags.openFinanceConnections = flags.openFinanceGateway && truthy(env.VITE_OPEN_FINANCE_CONNECTIONS)
    flags.openFinanceMockProvider = flags.openFinanceGateway && !appEnvironment.isProduction && truthy(env.VITE_OPEN_FINANCE_MOCK_PROVIDER)
    flags.openFinanceSandbox = flags.openFinanceGateway && truthy(env.VITE_OPEN_FINANCE_SANDBOX)
    flags.openFinanceWebhooks = flags.openFinanceGateway && truthy(env.VITE_OPEN_FINANCE_WEBHOOKS)
    flags.openFinanceOfficialSync = false
    flags.openFinanceAssistedSync = flags.openFinanceGateway && truthy(env.VITE_OPEN_FINANCE_ASSISTED_SYNC)
    flags.openFinanceRealConnection = flags.openFinanceGateway && !appEnvironment.isProduction && truthy(env.VITE_OPEN_FINANCE_REAL_CONNECTION)
    flags.openFinanceThirtyDayPilot = flags.openFinanceAssistedSync
    flags.openFinanceSyncReview = flags.openFinanceAssistedSync && truthy(env.VITE_OPEN_FINANCE_SYNC_REVIEW)
    flags.openFinanceManualPublish = flags.openFinanceSyncReview && truthy(env.VITE_OPEN_FINANCE_MANUAL_PUBLISH)
    flags.openFinanceHistoricalExpansion = flags.openFinanceAssistedSync && truthy(env.VITE_OPEN_FINANCE_HISTORICAL_EXPANSION)
    flags.openFinanceAutomaticSync = false
  }
  Object.keys(flags).forEach((flag) => { if (typeof overrides?.[flag] === 'boolean') flags[flag] = overrides[flag] })
  if (!flags.reconciliationEngine) {
    flags.reconciliationObservationMode = false
    flags.reconciliationReview = false
    flags.reconciliationExactAutoMatch = false
    flags.reconciliationRules = false
  }
  if (!flags.financialEventClassifier) for (const flag of ['financialRulesShadowMode','invoiceSettlementRules','internalTransferRules','reversalRules','financialRulesComparison','financialRulesOfficialRead']) flags[flag] = false
  flags.financialRulesOfficialRead = false
  if (!flags.openFinanceGateway) for (const flag of ['openFinanceConnections','openFinanceMockProvider','openFinanceSandbox','openFinanceWebhooks','openFinanceOfficialSync']) flags[flag] = false
  flags.openFinanceOfficialSync = false
  flags.openFinanceAutomaticSync = false
  flags.automaticOpenFinanceSync = false
  if (!appEnvironment.valid || appEnvironment.isProduction) flags.phase0BaselineTools = false
  return Object.freeze(flags)
}
export const isFeatureEnabled = (flag, options) => Boolean(resolveFeatureFlags(options)[flag])
