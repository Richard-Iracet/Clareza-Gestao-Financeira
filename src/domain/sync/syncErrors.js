export const SYNC_ERROR_CODES = {
  NETWORK: 'NETWORK_ERROR',
  AUTH: 'AUTH_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  CONFLICT: 'REVISION_CONFLICT',
  TIMEOUT: 'TIMEOUT_ERROR',
  REMOTE: 'REMOTE_ERROR',
}

export class FinanceSyncError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'FinanceSyncError'
    this.code = code
    this.cause = options.cause
    this.details = options.details
  }
}

export const classifyRemoteError = (error) => {
  if (error instanceof FinanceSyncError) return error
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  if (error?.name === 'AbortError' || text.includes('timeout')) return new FinanceSyncError(SYNC_ERROR_CODES.TIMEOUT, 'A operação remota excedeu o tempo limite.', { cause: error })
  if (error?.status === 401 || error?.status === 403 || text.includes('jwt')) return new FinanceSyncError(SYNC_ERROR_CODES.AUTH, 'A sessão expirou ou não possui autorização.', { cause: error })
  if (text.includes('fetch') || text.includes('network') || text.includes('offline')) return new FinanceSyncError(SYNC_ERROR_CODES.NETWORK, 'Não foi possível acessar o estado remoto.', { cause: error })
  return new FinanceSyncError(SYNC_ERROR_CODES.REMOTE, error?.message || 'Falha inesperada no armazenamento remoto.', { cause: error })
}
