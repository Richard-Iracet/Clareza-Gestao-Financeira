import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareImportBatch, decideImportRecord } from '../src/domain/import/importBatchService.js'
import { createMemoryImportBatchRepository } from '../src/infrastructure/storage/memoryImportBatchRepository.js'
const bytes = async (name) => new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url)))

test('mesmo conteúdo/nome diferente não duplica no mesmo usuário e contexto', async () => {
  const content = await bytes('statement-sgml.ofx')
  const first = await prepareImportBatch({ enabled: true, userId: 'a', file: { name: 'primeiro.ofx', bytes: content }, contextId: 'account-a' })
  const duplicate = await prepareImportBatch({ enabled: true, userId: 'a', file: { name: 'renomeado.ofx', bytes: content }, contextId: 'account-a', existing: { batches: [first.batch] } })
  assert.equal(duplicate.success, false); assert.equal(duplicate.errors[0].code, 'DUPLICATE_FILE'); assert.equal(duplicate.duplicateBatch.id, first.batch.id)
  const anotherUser = await prepareImportBatch({ enabled: true, userId: 'b', file: { name: 'mesmo.ofx', bytes: content }, contextId: 'account-a', existing: { batches: [first.batch] } })
  assert.equal(anotherUser.success, true)
})
test('FITID igual só é exato no mesmo contexto; fingerprint não elimina compras legítimas', async () => {
  const content = await bytes('statement-sgml.ofx')
  const first = await prepareImportBatch({ enabled: true, userId: 'a', file: { name: 'a.ofx', bytes: content }, contextId: 'one' })
  const otherAccount = await prepareImportBatch({ enabled: true, userId: 'a', file: { name: 'b.ofx', bytes: content }, contextId: 'two', existing: { externalIds: new Set(['a:ofx:one:fit-001']) } })
  assert.notEqual(otherAccount.records[0].reviewStatus, 'exact_duplicate')
  const csv = new TextEncoder().encode('data,descricao,valor\n2026-08-01,Compra,-10.00\n2026-08-01,Compra,-10.00')
  const repeated = await prepareImportBatch({ enabled: true, userId: 'a', file: { name: 'duas.csv', bytes: csv }, csv: { mapping: { date: 0, description: 1, amount: 2 }, dateFormat: 'iso', decimalFormat: 'international' } })
  assert.equal(repeated.records[0].reviewStatus, 'new'); assert.equal(repeated.records[1].reviewStatus, 'possible_duplicate')
  assert.equal(first.records.some((record) => record.reviewStatus === 'invalid'), true)
})
test('repositório em memória isola usuários e aceitar nunca cria lançamento oficial', async () => {
  const repository = createMemoryImportBatchRepository(), content = await bytes('statement-xml.ofx')
  const prepared = await prepareImportBatch({ enabled: true, userId: 'a', file: { name: 'card.ofx', bytes: content }, contextId: 'card' })
  await repository.savePrepared(prepared.batch, prepared.records)
  assert.equal((await repository.listBatches('b')).length, 0); assert.equal((await repository.listRecords('b', prepared.batch.id)).length, 0)
  const accepted = decideImportRecord(prepared.records[0], 'accept'); await repository.decide({ userId: 'a', recordId: accepted.id, decision: 'accept', reviewStatus: accepted.reviewStatus })
  assert.equal((await repository.listRecords('a', prepared.batch.id))[0].reviewStatus, 'accepted'); assert.equal(repository.snapshot().financialTransactions, undefined)
})
