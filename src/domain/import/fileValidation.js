import { IMPORT_ERROR, IMPORT_LIMITS } from './importConstants.js'

export const sanitizeFilename = (name) => String(name || 'arquivo').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'arquivo'
export const detectFileType = (name) => { const extension = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]; return extension === 'ofx' || extension === 'csv' ? extension : null }
export const decodeFileBytes = (bytes) => {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(source).replace(/^\uFEFF/, ''), encoding: 'utf-8' } }
  catch { return { text: new TextDecoder('windows-1252').decode(source).replace(/^\uFEFF/, ''), encoding: 'windows-1252' } }
}
export const hashFileBytes = async (bytes) => {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', source)
  return `sha256:${[...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('')}`
}
export const validateImportFile = ({ name, size, text, type = detectFileType(name), maxFileBytes = IMPORT_LIMITS.maxFileBytes }) => {
  const errors = []
  if (!type) errors.push({ code: IMPORT_ERROR.INVALID_EXTENSION, message: 'Selecione um arquivo .ofx ou .csv.' })
  if (!size || !String(text || '').trim()) errors.push({ code: IMPORT_ERROR.EMPTY_FILE, message: 'O arquivo está vazio.' })
  if (size > maxFileBytes) errors.push({ code: IMPORT_ERROR.FILE_TOO_LARGE, message: `O arquivo excede ${Math.floor(maxFileBytes / 1024 / 1024)} MB.` })
  const sample = String(text || '').slice(0, 4096)
  if (/<\s*(script|iframe|object|embed)\b/i.test(sample)) errors.push({ code: IMPORT_ERROR.CONTENT_MISMATCH, message: 'Conteúdo executável inesperado foi recusado.' })
  if (type === 'ofx' && !/(OFXHEADER|<OFX[>\s])/i.test(sample)) errors.push({ code: IMPORT_ERROR.CONTENT_MISMATCH, message: 'O conteúdo não parece ser OFX.' })
  if (type === 'csv' && /<OFX[>\s]/i.test(sample)) errors.push({ code: IMPORT_ERROR.CONTENT_MISMATCH, message: 'O conteúdo OFX não corresponde à extensão CSV.' })
  return { valid: errors.length === 0, errors, type, sanitizedName: sanitizeFilename(name) }
}
