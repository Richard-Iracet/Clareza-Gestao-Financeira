import { normalizeImportedMoney, combineDebitCredit } from './moneyNormalizer.js'
import { normalizeImportedDate } from './dateNormalizer.js'
import { normalizeText } from '../origin/fingerprint.js'

const cell = (row, mapping, field) => mapping[field] === undefined ? '' : row.values[mapping[field]] ?? ''
const issue = (code, message, row, field, value, severity = 'error') => ({ code, message, line: row.sourceLine, field, originalValue: String(value ?? '').slice(0, 180), solution: `Revise o mapeamento ou o valor de ${field}.`, severity })
export const validateCsvMapping = (mapping = {}) => {
  const missing = []
  if (mapping.description === undefined) missing.push('description')
  if (mapping.date === undefined) missing.push('date')
  if (mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined) missing.push('amount ou debit/credit')
  return { valid: missing.length === 0, missing }
}
export const normalizeCsvRows = (parsed, mapping, options = {}) => parsed.rows.map((row) => {
  const originalAmount = mapping.debit !== undefined || mapping.credit !== undefined ? `${cell(row, mapping, 'debit')}|${cell(row, mapping, 'credit')}` : cell(row, mapping, 'amount')
  const amount = mapping.debit !== undefined || mapping.credit !== undefined ? combineDebitCredit({ debit: cell(row, mapping, 'debit'), credit: cell(row, mapping, 'credit') }, options) : normalizeImportedMoney(originalAmount, options)
  const originalDate = cell(row, mapping, 'date'), date = normalizeImportedDate(originalDate, { format: options.dateFormat || 'iso' }), errors = []
  if (!amount.valid) errors.push(issue(amount.errorCode || 'INVALID_AMOUNT', amount.ambiguous ? 'Valor monetário ambíguo.' : 'Valor monetário inválido.', row, 'amount', originalAmount))
  if (!date.valid) errors.push(issue(date.errorCode || 'INVALID_DATE', date.errorCode === 'AMBIGUOUS_DATE' ? 'Data ambígua; confirme o formato.' : 'Data inválida.', row, 'date', originalDate))
  const description = cell(row, mapping, 'description')
  return { sourceLine: row.sourceLine, rawPayload: Object.fromEntries(parsed.headers.map((header, index) => [header, row.values[index] ?? ''])), originalDescription: description, normalizedDescription: normalizeText(description), originalAmount, amount, currency: String(cell(row, mapping, 'currency') || options.defaultCurrency || 'BRL').toUpperCase(), originalDate, date, externalTransactionId: cell(row, mapping, 'externalId') || null, inferredType: amount.valid ? (BigInt(amount.minorUnits) >= 0n ? 'income' : 'expense') : 'unknown', externalStatus: String(cell(row, mapping, 'status') || 'posted').toLowerCase() === 'pending' ? 'pending' : 'posted', originalCategory: cell(row, mapping, 'originalCategory') || null, notes: cell(row, mapping, 'notes') || null, errors, warnings: [] }
})
