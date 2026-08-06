import { IMPORT_LIMITS, IMPORT_PARSER_VERSION } from './importConstants.js'
import { normalizeImportedMoney } from './moneyNormalizer.js'
import { parseOfxDate } from './dateNormalizer.js'
import { normalizeText } from '../origin/fingerprint.js'

const entity = (value) => String(value || '').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").trim()
const tag = (source, name) => entity(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(source)?.[1]) || null
const blocks = (source, name, endNames) => {
  const start = new RegExp(`<${name}>`, 'ig'), positions = [...source.matchAll(start)].map((match) => match.index + match[0].length)
  return positions.map((position, index) => { const candidates = [source.search(new RegExp(`</${name}>`, 'i')), positions[index + 1] === undefined ? -1 : positions[index + 1] - `<${name}>`.length, ...endNames.map((end) => { const found = source.slice(position).search(new RegExp(`<\/?${end}[>\s]`, 'i')); return found < 0 ? -1 : position + found })].filter((value) => value >= position); const end = candidates.length ? Math.min(...candidates) : source.length; return source.slice(position, end) })
}
const error = (code, message, line, field, value, severity = 'error') => ({ code, message, line, field, originalValue: String(value ?? '').slice(0, 180), solution: `Revise ${field || 'o registro'} no arquivo de origem.`, severity })

export const parseOfx = async (text) => {
  const source = String(text), transactionBlocks = blocks(source, 'STMTTRN', ['BANKTRANLIST','CCSTMTRS','OFX'])
  if (!transactionBlocks.length) throw new Error('OFX sem registros STMTTRN interpretáveis.')
  if (transactionBlocks.length > IMPORT_LIMITS.maxRecords) throw new Error(`OFX excede ${IMPORT_LIMITS.maxRecords} registros.`)
  const account = { bankId: tag(source, 'BANKID'), branchId: tag(source, 'BRANCHID'), accountId: tag(source, 'ACCTID'), accountType: tag(source, 'ACCTTYPE'), cardNumber: tag(source, 'ACCTID') && /<CCACCTFROM>/i.test(source) ? tag(source, 'ACCTID') : null }
  const records = transactionBlocks.map((block, index) => {
    const sourceLine = index + 1, originalAmount = tag(block, 'TRNAMT'), originalDate = tag(block, 'DTPOSTED'), userDate = tag(block, 'DTUSER'), availableDate = tag(block, 'DTAVAIL')
    const amount = normalizeImportedMoney(originalAmount, { decimalFormat: 'international' }), date = parseOfxDate(originalDate)
    const errors = []
    if (!amount.valid) errors.push(error('INVALID_AMOUNT', 'Valor OFX inválido.', sourceLine, 'TRNAMT', originalAmount))
    if (!date.valid) errors.push(error('INVALID_DATE', 'Data OFX inválida.', sourceLine, 'DTPOSTED', originalDate))
    const description = [tag(block, 'NAME'), tag(block, 'MEMO')].filter(Boolean).join(' — ')
    return { sourceLine, rawPayload: { trnType: tag(block, 'TRNTYPE'), fitId: tag(block, 'FITID'), postedAt: originalDate, userDate, availableDate, amount: originalAmount, name: tag(block, 'NAME'), memo: tag(block, 'MEMO'), checkNumber: tag(block, 'CHECKNUM'), referenceNumber: tag(block, 'REFNUM'), status: tag(block, 'STATUS') }, originalDescription: description, normalizedDescription: normalizeText(description), originalAmount, amount, currency: tag(source, 'CURDEF') || 'BRL', originalDate, date, externalTransactionId: tag(block, 'FITID'), inferredType: amount.valid ? (BigInt(amount.minorUnits) >= 0n ? 'income' : 'expense') : 'unknown', externalStatus: String(tag(block, 'STATUS') || 'posted').toLowerCase() === 'pending' ? 'pending' : 'posted', errors, warnings: !tag(block, 'FITID') ? [error('MISSING_FITID', 'OFX sem FITID; identidade exige revisão.', sourceLine, 'FITID', '', 'warning')] : [] }
  })
  return { parser: 'ofx', parserVersion: IMPORT_PARSER_VERSION, format: /<\?xml|<\/(TRNAMT|FITID|DTPOSTED)>/i.test(source) ? 'xml' : 'sgml', statement: { bank: account.bankId, account, currency: tag(source, 'CURDEF') || 'BRL', dateStart: tag(source, 'DTSTART'), dateEnd: tag(source, 'DTEND'), statementType: /<CCSTMTRS>/i.test(source) ? 'card' : 'checking' }, records }
}
