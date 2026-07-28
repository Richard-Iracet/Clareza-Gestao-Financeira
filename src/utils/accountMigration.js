export const ACCOUNT_MIGRATION_VERSION = 1

// Deliberately does not infer accountId from the legacy textual `account` field.
export const migrateAccountsState = (state = {}) => ({
  state: { ...state, accounts: Array.isArray(state.accounts) ? state.accounts : [] },
  report: { migrationVersion: ACCOUNT_MIGRATION_VERSION, accountsIntroduced: !Array.isArray(state.accounts), transactionsChanged: 0, safe: true },
})
