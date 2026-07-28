import { FinanceSyncError, SYNC_ERROR_CODES, classifyRemoteError } from '../../domain/sync/syncErrors.js'
import { validateSnapshot } from '../../utils/snapshot.js'

const DEFAULT_TIMEOUT = 12000

const withTimeout = async (factory, timeoutMs = DEFAULT_TIMEOUT) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('Timeout', 'AbortError')), timeoutMs)
  try {
    return await factory(controller.signal)
  } catch (error) {
    throw classifyRemoteError(error)
  } finally {
    clearTimeout(timeout)
  }
}

const validateRemoteSnapshot = (row) => {
  const validation = validateSnapshot(row?.data)
  if (!validation.valid) throw new FinanceSyncError(SYNC_ERROR_CODES.VALIDATION, `O estado remoto é inválido: ${validation.errors.join(' ')}`, { details: validation.errors })
  if (Number(row.revision) !== Number(row.data.revision) || row.checksum !== row.data.checksum || Number(row.schema_version) !== Number(row.data.schemaVersion)) {
    throw new FinanceSyncError(SYNC_ERROR_CODES.VALIDATION, 'Os metadados remotos não correspondem ao snapshot armazenado.')
  }
  return {
    snapshot: row.data,
    revision: Number(row.revision),
    checksum: row.checksum,
    schemaVersion: Number(row.schema_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const throwIfError = (error) => {
  if (error) throw classifyRemoteError(error)
}

export const createRemoteFinanceRepository = (client, userId, options = {}) => {
  if (!client || !userId) throw new FinanceSyncError(SYNC_ERROR_CODES.AUTH, 'Cliente e usuário autenticado são obrigatórios.')
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT

  return {
    async load() {
      return withTimeout(async (signal) => {
        const query = client.from('finance_states').select('*').eq('user_id', userId).abortSignal(signal)
        const { data, error } = await query.maybeSingle()
        throwIfError(error)
        return data ? validateRemoteSnapshot(data) : null
      }, timeoutMs)
    },

    async create(snapshot) {
      const validation = validateSnapshot(snapshot)
      if (!validation.valid) throw new FinanceSyncError(SYNC_ERROR_CODES.VALIDATION, validation.errors.join(' '))
      return withTimeout(async (signal) => {
        const query = client.from('finance_states').insert({
          user_id: userId,
          data: snapshot,
          revision: snapshot.revision,
          schema_version: snapshot.schemaVersion,
          checksum: snapshot.checksum,
        }).select('*').abortSignal(signal)
        const { data, error } = await query.single()
        if (error?.code === '23505') throw new FinanceSyncError(SYNC_ERROR_CODES.CONFLICT, 'O estado remoto já foi criado por outro dispositivo.', { cause: error })
        throwIfError(error)
        return validateRemoteSnapshot(data)
      }, timeoutMs)
    },

    async update(snapshot, expectedRevision) {
      const validation = validateSnapshot(snapshot)
      if (!validation.valid) throw new FinanceSyncError(SYNC_ERROR_CODES.VALIDATION, validation.errors.join(' '))
      if (snapshot.revision !== Number(expectedRevision) + 1) throw new FinanceSyncError(SYNC_ERROR_CODES.VALIDATION, 'A nova revisão deve ser exatamente uma unidade maior que a revisão esperada.')
      return withTimeout(async (signal) => {
        const query = client.rpc('update_finance_state', {
          expected_revision: Number(expectedRevision),
          next_data: snapshot,
          next_schema_version: snapshot.schemaVersion,
          next_checksum: snapshot.checksum,
        }).abortSignal(signal)
        const { data, error } = await query
        throwIfError(error)
        const row = Array.isArray(data) ? data[0] : data
        if (!row) throw new FinanceSyncError(SYNC_ERROR_CODES.CONFLICT, 'O estado remoto foi alterado em outro dispositivo.')
        return validateRemoteSnapshot(row)
      }, timeoutMs)
    },
  }
}

export { validateRemoteSnapshot }
