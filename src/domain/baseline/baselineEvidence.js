import { getAppMetadata } from '../../config/appMetadata.js'
import { checksum } from '../../utils/snapshot.js'

export const createPhase0EvidencePackage = ({ backup, baselineReport, environment = 'development', testResult = null, generatedAt = new Date().toISOString() }) => {
  const evidence = {
    format: 'clareza-phase0-evidence', version: 1, generatedAt, environment,
    application: getAppMetadata(),
    backupSummary: { format: backup?.format, version: backup?.version, exportedAt: backup?.exportedAt, counts: backup?.metadata?.counts, snapshotId: backup?.snapshot?.snapshotId },
    baselineReport,
    checksums: { backup: backup ? checksum(backup) : null, snapshot: backup?.snapshot?.checksum || null, report: baselineReport?.reportChecksum || null },
    testResult,
  }
  return { ...evidence, evidenceChecksum: checksum(evidence) }
}
