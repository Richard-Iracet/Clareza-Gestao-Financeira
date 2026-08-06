const validCivil = (year, month, day) => { const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day }
const result = (original, format, year, month, day, extra = {}) => validCivil(year, month, day) ? { valid: true, original, format, accountingDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, ...extra } : { valid: false, original, format, errorCode: 'INVALID_DATE' }
export const parseOfxDate = (value) => {
  const original = String(value ?? '').trim(), match = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?(?:\.\d+)?(?:\[([+-]?\d+(?:\.\d+)?):([^\]]+)\])?/.exec(original)
  if (!match) return { valid: false, original, format: 'ofx', errorCode: 'INVALID_DATE' }
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), hour = Number(match[4] || 0), minute = Number(match[5] || 0), second = Number(match[6] || 0)
  const offsetHours = match[7] === undefined ? null : Number(match[7]), timezone = match[8] || null
  let instant = null
  if (match[4] && Number.isFinite(offsetHours)) instant = new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute, second)).toISOString()
  return result(original, 'ofx', year, month, day, { timezone, offset: match[7] || null, instant })
}
export const normalizeImportedDate = (value, { format = 'iso' } = {}) => {
  const original = String(value ?? '').trim()
  if (format === 'ofx') return parseOfxDate(original)
  let match
  if (format === 'br') { match = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](.*))?$/.exec(original); return match ? result(original, 'DD/MM/YYYY', Number(match[3]), Number(match[2]), Number(match[1])) : { valid: false, original, format, errorCode: 'INVALID_DATE' } }
  match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](.*))?$/.exec(original)
  if (!match) return { valid: false, original, format, errorCode: /^\d{2}\/\d{2}\/\d{4}$/.test(original) ? 'AMBIGUOUS_DATE' : 'INVALID_DATE' }
  const base = result(original, 'YYYY-MM-DD', Number(match[1]), Number(match[2]), Number(match[3]))
  if (base.valid && match[4]) { const parsed = Date.parse(original); if (!Number.isNaN(parsed)) base.instant = new Date(parsed).toISOString() }
  return base
}
