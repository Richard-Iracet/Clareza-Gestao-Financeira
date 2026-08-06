import { CSV_FIELDS, IMPORT_LIMITS } from './importConstants.js'

export const parseCsvMatrix = (text, delimiter) => {
  const rows = []; let row = [], field = '', quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) { if (char === '"' && text[index + 1] === '"') { field += '"'; index++ } else if (char === '"') quoted = false; else field += char }
    else if (char === '"') quoted = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (quoted) throw new Error('CSV possui campo entre aspas não finalizado.')
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  return rows.filter((item) => item.some((value) => value.trim() !== ''))
}
export const detectCsvDelimiter = (text) => {
  const sample = String(text).split(/\r?\n/).slice(0, 8).join('\n'), candidates = [',',';','\t']
  return candidates.map((delimiter) => { try { const rows = parseCsvMatrix(sample, delimiter); const widths = rows.map((row) => row.length); return { delimiter, score: widths.length && Math.min(...widths) > 1 && new Set(widths).size === 1 ? widths[0] : 0 } } catch { return { delimiter, score: 0 } } }).sort((a, b) => b.score - a.score)[0].delimiter
}
const headerNames = { description: ['descricao','descrição','historico','histórico','memo','name'], date: ['data','date','dtposted'], amount: ['valor','amount','trnamt'], debit: ['debito','débito','debit'], credit: ['credito','crédito','credit'], currency: ['moeda','currency'], externalId: ['fitid','id','identificador'], balance: ['saldo','balance'], originalCategory: ['categoria','category'], status: ['status','situacao','situação'], notes: ['observacao','observação','notes'] }
const normalizeHeader = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
export const suggestCsvMapping = (headers) => Object.fromEntries(CSV_FIELDS.flatMap((field) => { const index = headers.findIndex((header) => headerNames[field]?.map(normalizeHeader).includes(normalizeHeader(header))); return index >= 0 ? [[field, index]] : [] }))
export const parseCsv = (text, { delimiter = detectCsvDelimiter(text), hasHeader = true } = {}) => {
  const matrix = parseCsvMatrix(String(text).replace(/^\uFEFF/, ''), delimiter)
  if (matrix.length > IMPORT_LIMITS.maxRecords + (hasHeader ? 1 : 0)) throw new Error(`CSV excede ${IMPORT_LIMITS.maxRecords} registros.`)
  const headers = hasHeader ? matrix[0] : matrix[0]?.map((_, index) => `Coluna ${index + 1}`) || []
  return { delimiter, hasHeader, headers, suggestedMapping: hasHeader ? suggestCsvMapping(headers) : {}, rows: matrix.slice(hasHeader ? 1 : 0).map((values, index) => ({ sourceLine: index + (hasHeader ? 2 : 1), values })) }
}
