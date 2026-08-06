export const RECONCILIATION_ALGORITHM_VERSION = 'reconciliation-score-v1'
export const RECONCILIATION_FEATURE_VERSION = 1
export const RECONCILIATION_DESCRIPTION_VERSION = 1
export const RECONCILIATION_MODES = Object.freeze(['disabled','observation','review','exact_auto_match'])
export const DEFAULT_RECONCILIATION_CONFIG = Object.freeze({ mode: 'disabled', commonWindowDays: 3, cardWindowDays: 5, pendingPostedWindowDays: 10, ownTransferWindowDays: 2, refundWindowDays: 90, candidateLimit: 25, pageSize: 100, strongThreshold: 82, weakThreshold: 60, conflictDelta: 3, exactAutoMatch: false })
export const mergeReconciliationConfig = (overrides = {}) => Object.freeze({ ...DEFAULT_RECONCILIATION_CONFIG, ...overrides })
