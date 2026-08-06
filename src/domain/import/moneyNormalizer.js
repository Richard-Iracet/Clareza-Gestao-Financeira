const strip = (value) => String(value ?? '').trim().replace(/[R$€£¥\s]/g, '')
const decimalString = (minor) => { const negative = minor < 0n, absolute = negative ? -minor : minor; return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}` }
export const normalizeImportedMoney = (value, { decimalFormat = 'auto', invertSign = false } = {}) => {
  const original = String(value ?? ''), raw = strip(value)
  if (!raw) return { valid: false, original, errorCode: 'EMPTY_AMOUNT' }
  const parenthesized = /^\(.*\)$/.test(raw), signed = raw.replace(/[()]/g, '')
  if (!/^[+-]?[\d.,]+$/.test(signed)) return { valid: false, original, errorCode: 'INVALID_AMOUNT' }
  const comma = signed.lastIndexOf(','), dot = signed.lastIndexOf('.')
  let decimalSeparator = null, ambiguous = false
  if (decimalFormat === 'br') decimalSeparator = ','
  else if (decimalFormat === 'international') decimalSeparator = '.'
  else if (comma >= 0 && dot >= 0) decimalSeparator = comma > dot ? ',' : '.'
  else if (comma >= 0 || dot >= 0) { const separator = comma >= 0 ? ',' : '.', digits = signed.length - signed.lastIndexOf(separator) - 1; if (digits <= 2) decimalSeparator = separator; else if (digits === 3) ambiguous = true }
  if (ambiguous) return { valid: false, ambiguous: true, original, errorCode: 'AMBIGUOUS_AMOUNT' }
  const negative = parenthesized || signed.startsWith('-'), unsigned = signed.replace(/^[+-]/, '')
  const parts = decimalSeparator ? unsigned.split(decimalSeparator) : [unsigned]
  if (parts.length > 2) return { valid: false, original, errorCode: 'INVALID_AMOUNT' }
  const whole = parts[0].replace(/[.,]/g, '') || '0', fraction = (parts[1] || '').padEnd(2, '0')
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return { valid: false, original, errorCode: 'INVALID_AMOUNT' }
  let minor = BigInt(whole) * 100n + BigInt(fraction || '0'); if (negative) minor = -minor; if (invertSign) minor = -minor
  return { valid: true, original, minorUnits: minor.toString(), decimal: decimalString(minor), sign: minor > 0n ? 'positive' : minor < 0n ? 'negative' : 'zero', ambiguous: false }
}
export const combineDebitCredit = ({ debit, credit }, options) => {
  const hasDebit = String(debit ?? '').trim() !== '', hasCredit = String(credit ?? '').trim() !== ''
  if (hasDebit && hasCredit) return { valid: false, errorCode: 'DEBIT_AND_CREDIT_FILLED' }
  const normalized = normalizeImportedMoney(hasDebit ? debit : credit, options)
  if (!normalized.valid) return normalized
  let minor = BigInt(normalized.minorUnits)
  if (hasDebit && minor > 0n) minor = -minor
  if (hasCredit && minor < 0n) minor = -minor
  return { ...normalized, minorUnits: minor.toString(), decimal: decimalString(minor), sign: minor > 0n ? 'positive' : minor < 0n ? 'negative' : 'zero' }
}
export const summarizeMoney = (records) => records.reduce((out, item) => { if (!item.amount?.valid) return out; const value = BigInt(item.amount.minorUnits); out.net += value; if (value > 0n) { out.income += value; out.positiveCount++ } else if (value < 0n) { out.expense += -value; out.negativeCount++ } return out }, { income: 0n, expense: 0n, net: 0n, positiveCount: 0, negativeCount: 0 })
export const serializeMoneySummary = (summary) => Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === 'bigint' ? decimalString(value) : value]))
