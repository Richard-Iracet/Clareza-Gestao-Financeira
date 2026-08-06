import { BACKUP_FORMAT_VERSION, CURRENT_FINANCE_DATA_VERSION } from '../utils/dataValidation.js'
import { SNAPSHOT_SCHEMA_VERSION } from '../utils/snapshot.js'

const env = () => import.meta.env || {}
const optional = (value) => String(value || '').trim() || null

export const DATABASE_SCHEMA_VERSION = 1
export const getAppMetadata = (source = env()) => ({
  applicationName: 'Clareza',
  appVersion: typeof __APP_VERSION__ === 'undefined' ? '1.0.0' : __APP_VERSION__,
  buildId: optional(source.VITE_BUILD_ID),
  gitCommit: optional(source.VITE_GIT_COMMIT),
  buildTimestamp: optional(source.VITE_BUILD_TIMESTAMP),
  backupFormatVersion: BACKUP_FORMAT_VERSION,
  snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
  financeDataVersion: CURRENT_FINANCE_DATA_VERSION,
  databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
})
