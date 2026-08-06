import { readFile } from 'node:fs/promises'
import { createRelationalEquivalenceReport } from '../src/domain/relational/equivalenceService.js'

const [legacyPath, relationalPath] = process.argv.slice(2)
if (!legacyPath || !relationalPath) throw new Error('Uso: node scripts/compare-relational-shadow.mjs <snapshot.json> <relational-export.json>')
const snapshot = JSON.parse(await readFile(legacyPath, 'utf8'))
const entities = JSON.parse(await readFile(relationalPath, 'utf8'))
const report = createRelationalEquivalenceReport({ legacyState: snapshot.data, relationalEntities: entities, source: { revision: snapshot.revision, snapshotId: snapshot.snapshotId, checksum: snapshot.checksum } })
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
