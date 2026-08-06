import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseOfx } from '../src/domain/import/ofxParser.js'
const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

test('OFX SGML extrai conta, FITID, caracteres, timezone e mantém erro por registro', async () => {
  const parsed = await parseOfx(await fixture('statement-sgml.ofx'))
  assert.equal(parsed.format, 'sgml'); assert.equal(parsed.statement.statementType, 'checking'); assert.equal(parsed.statement.account.accountId, 'anon-checking')
  assert.equal(parsed.records[0].externalTransactionId, 'fit-001'); assert.match(parsed.records[0].originalDescription, /Mercado & Cia/); assert.equal(parsed.records[0].amount.decimal, '-25.90'); assert.equal(parsed.records[0].date.timezone, 'BRT')
  assert.equal(parsed.records[1].externalTransactionId, null); assert.equal(parsed.records[1].errors[0].code, 'INVALID_DATE'); assert.equal(parsed.records[1].warnings[0].code, 'MISSING_FITID')
})
test('OFX XML de cartão é reconhecido', async () => {
  const parsed = await parseOfx(await fixture('statement-xml.ofx')); assert.equal(parsed.format, 'xml'); assert.equal(parsed.statement.statementType, 'card'); assert.equal(parsed.records[0].externalTransactionId, 'card-001')
})
