export const RECURRENCE_MIGRATION_VERSION = 1

// This migration is intentionally additive. It never attempts to infer a recurring
// rule from historical transactions or transfers, because doing so could create
// duplicate financial occurrences or silently change a user's cash-flow forecast.
export const migrateRecurrencesState = (state = {}) => ({
  state: {
    ...state,
    recurrences: Array.isArray(state.recurrences) ? state.recurrences : [],
    alertStates: Array.isArray(state.alertStates) ? state.alertStates : [],
  },
  report: {
    migrationVersion: RECURRENCE_MIGRATION_VERSION,
    recurrencesIntroduced: !Array.isArray(state.recurrences),
    alertStatesIntroduced: !Array.isArray(state.alertStates),
    recurrencesChanged: 0,
    alertStatesChanged: 0,
    historicalOccurrencesInferred: 0,
    safe: true,
  },
})

