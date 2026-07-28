export const TRANSFER_MIGRATION_VERSION = 1

// Deliberately introduces only an empty collection. It never infers transfers from historic income or expense records.
export const migrateTransfersState = (state = {}) => ({
  state: { ...state, transfers: Array.isArray(state.transfers) ? state.transfers : [] },
  report: {
    migrationVersion: TRANSFER_MIGRATION_VERSION,
    transfersIntroduced: !Array.isArray(state.transfers),
    transfersChanged: 0,
    safe: true,
  },
})
