import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { detectCsvDelimiter, parseCsv, parseCsvMatrix } from '../src/domain/import/csvParser.js'
import { normalizeCsvRows, validateCsvMapping } from '../src/domain/import/csvNormalizer.js'
const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

test('CSV trata BOM, ponto e vírgula, aspas, separador na descrição e erros parciais', async () => {
  const text = await fixture('statement-br.csv'); assert.equal(detectCsvDelimiter(text), ';')
  const parsed = parseCsv(text); assert.equal(parsed.headers[0], 'Data'); assert.equal(parsed.rows[0].values[1], 'Mercado; bairro')
  const mapping = { date: 0, description: 1, debit: 2, credit: 3, currency: 4, externalId: 5 }
  const rows = normalizeCsvRows(parsed, mapping, { dateFormat: 'br', decimalFormat: 'br' })
  assert.equal(rows[0].amount.decimal, '-1234.56'); assert.equal(rows[1].amount.decimal, '2500.00'); assert.equal(rows[2].errors[0].code, 'INVALID_DATE')
})
test('CSV usa máquina de estados para vírgulas, quebras e arquivo sem cabeçalho', () => {
  const matrix = parseCsvMatrix('a,b\n1,"texto, com vírgula"\n2,"linha\ncontinua"', ',')
  assert.equal(matrix[1][1], 'texto, com vírgula'); assert.equal(matrix[2][1], 'linha\ncontinua')
  const noHeader = parseCsv('01/08/2026\tTeste\t-10,00', { delimiter: '\t', hasHeader: false }); assert.deepEqual(noHeader.headers, ['Coluna 1','Coluna 2','Coluna 3']); assert.equal(noHeader.rows.length, 1)
})
test('CSV internacional preserva decimal com milhares dentro de aspas', async () => {
  const parsed = parseCsv(await fixture('statement-international.csv'), { delimiter: ',', hasHeader: true })
  const rows = normalizeCsvRows(parsed, { date: 0, description: 1, amount: 2, externalId: 3 }, { dateFormat: 'iso', decimalFormat: 'international' })
  assert.equal(rows[0].amount.decimal, '-12.34'); assert.equal(rows[1].amount.decimal, '1234.56')
})
test('mapeamento exige somente descrição, data e uma estratégia de valor', () => {
  assert.deepEqual(validateCsvMapping({ description: 0, date: 1, debit: 2, credit: 3 }), { valid: true, missing: [] })
  assert.equal(validateCsvMapping({ description: 0 }).valid, false)
})
