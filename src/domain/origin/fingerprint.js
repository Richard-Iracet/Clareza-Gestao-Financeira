export const FINGERPRINT_VERSION = 1
export const NORMALIZATION_VERSION = 1

export const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('')
export const stableHash = async (value) => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 indisponível.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value)))
  return `sha256:${bytesToHex(digest)}`
}
export const normalizeText = (value) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
export const normalizeCurrency = (value) => String(value || 'BRL').trim().toUpperCase()
export const normalizeMoney = (value) => {
  const raw = String(value ?? '').trim().replace(',', '.')
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!match) return null
  const sign = match[1] === '-' ? '-' : ''
  const integer = match[2].replace(/^0+(?=\d)/, '') || '0'
  const fraction = (match[3] || '').replace(/0+$/, '')
  return `${sign}${integer}${fraction ? `.${fraction}` : ''}`
}
export const normalizeAccountingDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null
export const normalizeExternalTransaction = (input = {}) => ({
  description: normalizeText(input.description), amount: normalizeMoney(input.amount), currency: normalizeCurrency(input.currency),
  accountingDate: normalizeAccountingDate(input.accountingDate ?? input.date), externalAccountKey: normalizeText(input.externalAccountKey ?? input.externalAccountId),
  externalStatus: String(input.externalStatus || 'unknown').toLowerCase(),
})
export const createTransactionFingerprint = async (input, version = FINGERPRINT_VERSION) => ({ version, fingerprint: await stableHash({ version, ...normalizeExternalTransaction(input) }), normalized: normalizeExternalTransaction(input) })
export const createPayloadHash = (payload) => stableHash(payload)
