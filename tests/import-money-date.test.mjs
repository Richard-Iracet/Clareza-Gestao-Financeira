import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeImportedMoney, combineDebitCredit, serializeMoneySummary, summarizeMoney } from '../src/domain/import/moneyNormalizer.js'
import { normalizeImportedDate, parseOfxDate } from '../src/domain/import/dateNormalizer.js'

test('dinheiro é normalizado exatamente sem Number ou parseFloat', () => {
  const cases = [['1.234,56','br','1234.56'],['1234,56','br','1234.56'],['1,234.56','international','1234.56'],['-25,90','br','-25.90'],['(25,90)','br','-25.90'],['0','br','0.00']]
  cases.forEach(([input, decimalFormat, expected]) => assert.equal(normalizeImportedMoney(input, { decimalFormat }).decimal, expected))
  assert.equal(combineDebitCredit({ debit: '25,90', credit: '' }, { decimalFormat: 'br' }).decimal, '-25.90')
  assert.equal(combineDebitCredit({ debit: '', credit: '25,90' }, { decimalFormat: 'br' }).decimal, '25.90')
  assert.equal(normalizeImportedMoney('1.234').ambiguous, true)
  const summary = serializeMoneySummary(summarizeMoney([{ amount: normalizeImportedMoney('10,00', { decimalFormat: 'br' }) }, { amount: normalizeImportedMoney('-2,50', { decimalFormat: 'br' }) }]))
  assert.deepEqual(summary, { income: '10.00', expense: '2.50', net: '7.50', positiveCount: 1, negativeCount: 1 })
})
test('datas usam formato explícito e OFX preserva offset/timezone', () => {
  assert.equal(normalizeImportedDate('01/02/2026', { format: 'br' }).accountingDate, '2026-02-01')
  assert.equal(normalizeImportedDate('2026-02-01', { format: 'iso' }).accountingDate, '2026-02-01')
  assert.equal(normalizeImportedDate('01/02/2026', { format: 'iso' }).errorCode, 'AMBIGUOUS_DATE')
  assert.equal(normalizeImportedDate('31/02/2026', { format: 'br' }).valid, false)
  const ofx = parseOfxDate('20260805123000[-3:BRT]'); assert.equal(ofx.accountingDate, '2026-08-05'); assert.equal(ofx.timezone, 'BRT'); assert.equal(ofx.offset, '-3'); assert.ok(ofx.instant)
})
