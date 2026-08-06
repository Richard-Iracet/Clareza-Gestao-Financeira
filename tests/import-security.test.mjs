import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareImportBatch } from '../src/domain/import/importBatchService.js'
import { IMPORT_LIMITS } from '../src/domain/import/importConstants.js'
import { validateImportFile, sanitizeFilename } from '../src/domain/import/fileValidation.js'

test('operação exige flag e valida extensão, vazio, tamanho e conteúdo', async () => {
  await assert.rejects(() => prepareImportBatch({ enabled: false, userId: 'u', file: { name: 'x.csv', bytes: new Uint8Array([1]) } }), /desativada/)
  assert.equal(validateImportFile({ name: 'x.exe', size: 1, text: 'a' }).errors[0].code, 'INVALID_EXTENSION')
  assert.equal(validateImportFile({ name: 'x.csv', size: 0, text: '' }).errors[0].code, 'EMPTY_FILE')
  assert.ok(validateImportFile({ name: 'x.csv', size: IMPORT_LIMITS.maxFileBytes + 1, text: 'a,b' }).errors.some((item) => item.code === 'FILE_TOO_LARGE'))
  assert.ok(validateImportFile({ name: 'x.ofx', size: 3, text: 'a,b' }).errors.some((item) => item.code === 'CONTENT_MISMATCH'))
  assert.ok(validateImportFile({ name: 'x.csv', size: 20, text: '<script>alert(1)</script>' }).errors.some((item) => item.code === 'CONTENT_MISMATCH'))
  assert.equal(sanitizeFilename('../extrato<script>.csv'), '.._extrato_script_.csv')
})
test('descrição com HTML comum permanece texto e nunca é executada pelo domínio', async () => {
  const bytes = new TextEncoder().encode('data,descricao,valor\n2026-08-01,"<b>Compra</b>",-1.00')
  const result = await prepareImportBatch({ enabled: true, userId: 'u', file: { name: 'safe.csv', bytes }, csv: { mapping: { date: 0, description: 1, amount: 2 }, dateFormat: 'iso', decimalFormat: 'international' } })
  assert.equal(result.records[0].originalDescription, '<b>Compra</b>'); assert.equal(result.records[0].rawPayload.descricao, '<b>Compra</b>')
})
