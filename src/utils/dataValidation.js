import { ACCOUNT_TYPES, isValidAccountDate } from '../domain/accounts/accountService.js'
import { getTransferOperationIds, validateTransferRecord } from '../domain/transfers/transferService.js'
import { validateRecurrenceRecord } from '../domain/recurrences/recurrenceService.js'

export const BACKUP_FORMAT_VERSION = 1
export const CURRENT_FINANCE_DATA_VERSION = 4

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isFiniteNumber = (value) => Number.isFinite(Number(value))

const validateRecurrenceReference = (item, label, errors) => {
  const hasReference = ['recurrenceId', 'recurrenceType', 'recurrenceOccurrenceId', 'scheduledOccurrenceDate', 'generatedFromRecurrence', 'detachedFromRecurrence', 'recurrenceVersion'].some((field) => item[field] !== undefined)
  if (!hasReference) return
  if (typeof item.recurrenceId !== 'string' || !item.recurrenceId) errors.push(`${label}: recurrenceId obrigat\u00f3rio para uma ocorr\u00eancia recorrente.`)
  if (item.recurrenceType !== undefined && !['income', 'expense', 'transfer'].includes(item.recurrenceType)) errors.push(`${label}: recurrenceType inv\u00e1lido.`)
  if (typeof item.recurrenceOccurrenceId !== 'string' || !item.recurrenceOccurrenceId) errors.push(`${label}: recurrenceOccurrenceId obrigat\u00f3rio para uma ocorr\u00eancia recorrente.`)
  if (!isValidAccountDate(item.scheduledOccurrenceDate)) errors.push(`${label}: data da ocorr\u00eancia recorrente inv\u00e1lida.`)
  if (item.generatedFromRecurrence !== true) errors.push(`${label}: generatedFromRecurrence deve ser verdadeiro.`)
  if (item.detachedFromRecurrence !== undefined && typeof item.detachedFromRecurrence !== 'boolean') errors.push(`${label}: detachedFromRecurrence inv\u00e1lido.`)
  if (item.recurrenceVersion !== undefined && !(typeof item.recurrenceVersion === 'string' && !Number.isNaN(Date.parse(item.recurrenceVersion))) && (!Number.isInteger(Number(item.recurrenceVersion)) || Number(item.recurrenceVersion) < 1)) errors.push(`${label}: recurrenceVersion inv\u00e1lida.`)
}

const validateRecurrence = (recurrence, index, errors, accounts = [], cards = []) => {
  const result = validateRecurrenceRecord(recurrence, { accounts, cards, allowArchived: true })
  result.errors.forEach((error) => errors.push(`Recorr\u00eancia ${index + 1}: ${error}`))
}

const validateAlertState = (state, index, errors) => {
  const label = `Estado de alerta ${index + 1}`
  if (!isObject(state)) { errors.push(`${label}: estrutura inv\u00e1lida.`); return }
  if (typeof state.alertKey !== 'string' || !state.alertKey) errors.push(`${label}: alertKey obrigat\u00f3rio.`)
  ;['dismissed', 'read'].forEach((field) => { if (state[field] !== undefined && typeof state[field] !== 'boolean') errors.push(`${label}: ${field} inv\u00e1lido.`) })
  ;['createdAt', 'updatedAt', 'dismissedAt', 'readAt', 'snoozedUntil'].forEach((field) => {
    if (state[field] !== undefined && state[field] !== null && (typeof state[field] !== 'string' || Number.isNaN(Date.parse(state[field])))) errors.push(`${label}: ${field} inv\u00e1lido.`)
  })
}

const validateTransaction = (item, index, errors) => {
  if (!isObject(item)) { errors.push(`Lan\u00e7amento ${index + 1}: estrutura inv\u00e1lida.`); return }
  if (typeof item.id !== 'string' || !item.id) errors.push(`Lan\u00e7amento ${index + 1}: id obrigat\u00f3rio.`)
  if (typeof item.description !== 'string') errors.push(`Lan\u00e7amento ${index + 1}: descri\u00e7\u00e3o inv\u00e1lida.`)
  if (!isFiniteNumber(item.amount)) errors.push(`Lan\u00e7amento ${index + 1}: valor inv\u00e1lido.`)
  if (!['expense', 'income'].includes(item.type)) errors.push(`Lan\u00e7amento ${index + 1}: tipo inv\u00e1lido.`)
  if (item.accountId !== undefined && item.accountId !== null && typeof item.accountId !== 'string') errors.push(`Lan\u00e7amento ${index + 1}: accountId inv\u00e1lido.`)
  validateRecurrenceReference(item, `Lan\u00e7amento ${index + 1}`, errors)
}

const validateCard = (card, index, errors) => {
  if (!isObject(card)) { errors.push(`Cart\u00e3o ${index + 1}: estrutura inv\u00e1lida.`); return }
  if (typeof card.id !== 'string' || !card.id) errors.push(`Cart\u00e3o ${index + 1}: id obrigat\u00f3rio.`)
  if (typeof card.name !== 'string' || !card.name) errors.push(`Cart\u00e3o ${index + 1}: nome obrigat\u00f3rio.`)
  if (!isFiniteNumber(card.closingDay) || Number(card.closingDay) < 1 || Number(card.closingDay) > 31) errors.push(`Cart\u00e3o ${index + 1}: fechamento inv\u00e1lido.`)
  if (!isFiniteNumber(card.dueDay) || Number(card.dueDay) < 1 || Number(card.dueDay) > 31) errors.push(`Cart\u00e3o ${index + 1}: vencimento inv\u00e1lido.`)
}

const validateAccount = (account, index, errors) => {
  if (!isObject(account)) { errors.push(`Conta ${index + 1}: estrutura inv\u00e1lida.`); return }
  if (typeof account.accountId !== 'string' || !account.accountId) errors.push(`Conta ${index + 1}: accountId obrigat\u00f3rio.`)
  if (typeof account.name !== 'string' || !account.name.trim()) errors.push(`Conta ${index + 1}: nome obrigat\u00f3rio.`)
  if (!ACCOUNT_TYPES.includes(account.type)) errors.push(`Conta ${index + 1}: tipo inv\u00e1lido.`)
  if (account.currency !== 'BRL') errors.push(`Conta ${index + 1}: moeda incompat\u00edvel.`)
  if (!isFiniteNumber(account.initialBalance)) errors.push(`Conta ${index + 1}: saldo inicial inv\u00e1lido.`)
  if (!isValidAccountDate(account.initialBalanceDate)) errors.push(`Conta ${index + 1}: data-base inv\u00e1lida.`)
  if (account.archived !== undefined && typeof account.archived !== 'boolean') errors.push(`Conta ${index + 1}: status de arquivamento inv\u00e1lido.`)
}

const validateTransfer = (transfer, index, errors, accounts) => {
  const result = validateTransferRecord(transfer, { accounts, allowArchived: true })
  result.errors.forEach((error) => errors.push(`Transfer\u00eancia ${index + 1}: ${error}`))
}

const duplicateValues = (values) => {
  const counts = new Map()
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value)
}

export const validateBackup = (backup) => {
  const errors = []
  if (!isObject(backup)) return { valid: false, errors: ['O arquivo n\u00e3o cont\u00e9m um objeto JSON v\u00e1lido.'] }
  if (backup.format !== 'clareza-finance-backup') errors.push('Formato de backup n\u00e3o reconhecido.')
  if (backup.version !== BACKUP_FORMAT_VERSION) errors.push(`Vers\u00e3o de backup incompat\u00edvel. Esperada: ${BACKUP_FORMAT_VERSION}.`)
  if (!backup.exportedAt || Number.isNaN(Date.parse(backup.exportedAt))) errors.push('Data de exporta\u00e7\u00e3o inv\u00e1lida.')
  if (!isObject(backup.metadata)) errors.push('Metadados ausentes ou inv\u00e1lidos.')
  if (!isObject(backup.data)) errors.push('Bloco de dados ausente ou inv\u00e1lido.')
  if (!isObject(backup.storage)) errors.push('Fotografia do LocalStorage ausente ou inv\u00e1lida.')
  const data = isObject(backup.data) ? backup.data : {}
  if (!Array.isArray(data.transactions)) errors.push('Lista de lan\u00e7amentos ausente ou inv\u00e1lida.')
  else data.transactions.forEach((item, index) => validateTransaction(item, index, errors))
  if (!Array.isArray(data.cards)) errors.push('Lista de cart\u00f5es ausente ou inv\u00e1lida.')
  else data.cards.forEach((card, index) => validateCard(card, index, errors))
  if (data.accounts !== undefined) {
    if (!Array.isArray(data.accounts)) errors.push('Lista de contas inv\u00e1lida.')
    else {
      data.accounts.forEach((account, index) => validateAccount(account, index, errors))
      const duplicateIds = duplicateValues(data.accounts.map((account) => account?.accountId))
      if (duplicateIds.length) errors.push(`Existem accountId duplicados no backup: ${duplicateIds.join(', ')}.`)
    }
  }
  if (data.transfers !== undefined) {
    if (!Array.isArray(data.transfers)) errors.push('Lista de transfer\u00eancias inv\u00e1lida.')
    else {
      if (data.transfers.length && !Array.isArray(data.accounts)) errors.push('Transfer\u00eancias exigem uma lista de contas no backup.')
      data.transfers.forEach((transfer, index) => validateTransfer(transfer, index, errors, Array.isArray(data.accounts) ? data.accounts : []))
      const duplicateIds = duplicateValues(data.transfers.map((transfer) => transfer?.transferId))
      if (duplicateIds.length) errors.push(`Existem transferId duplicados no backup: ${duplicateIds.join(', ')}.`)
      const duplicateOperations = duplicateValues(data.transfers.flatMap((transfer) => getTransferOperationIds(transfer)))
      if (duplicateOperations.length) errors.push(`Existem operationId de transfer\u00eancia duplicados no backup: ${duplicateOperations.join(', ')}.`)
      const duplicateReversals = duplicateValues(data.transfers.map((transfer) => transfer?.reversal?.reversalId))
      if (duplicateReversals.length) errors.push(`Existem reversalId duplicados no backup: ${duplicateReversals.join(', ')}.`)
    }
  }
  if (data.recurrences !== undefined) {
    if (!Array.isArray(data.recurrences)) errors.push('Lista de recorr\u00eancias inv\u00e1lida.')
    else {
      data.recurrences.forEach((recurrence, index) => validateRecurrence(recurrence, index, errors, Array.isArray(data.accounts) ? data.accounts : [], Array.isArray(data.cards) ? data.cards : []))
      const duplicateIds = duplicateValues(data.recurrences.map((recurrence) => recurrence?.recurrenceId))
      if (duplicateIds.length) errors.push(`Existem recurrenceId duplicados no backup: ${duplicateIds.join(', ')}.`)
      const recurrenceIds = new Set(data.recurrences.map((recurrence) => recurrence?.recurrenceId).filter(Boolean))
      const generatedRecords = [
        ...(Array.isArray(data.transactions) ? data.transactions : []),
        ...(Array.isArray(data.transfers) ? data.transfers : []),
      ].filter((record) => record?.generatedFromRecurrence || record?.recurrenceId || record?.recurrenceOccurrenceId)
      const unknownRules = generatedRecords.filter((record) => record?.recurrenceId && !recurrenceIds.has(record.recurrenceId))
      if (unknownRules.length) errors.push(`Existem ${unknownRules.length} ocorr\u00eancia(s) recorrente(s) sem regra correspondente no backup.`)
      const duplicateOccurrences = duplicateValues(generatedRecords.map((record) => record?.recurrenceOccurrenceId))
      if (duplicateOccurrences.length) errors.push(`Existem occurrenceId recorrentes duplicados no backup: ${duplicateOccurrences.join(', ')}.`)
      if (Array.isArray(data.categories)) {
        const invalidCategories = data.recurrences.filter((recurrence) => recurrence?.category && !data.categories.includes(recurrence.category)).map((recurrence) => recurrence.recurrenceId)
        if (invalidCategories.length) errors.push(`Existem recorrências com categoria inexistente no backup: ${invalidCategories.join(', ')}.`)
      }
    }
  }
  if (Array.isArray(data.recurrences)) {
    const recurrenceById = new Map(data.recurrences.map((recurrence) => [recurrence?.recurrenceId, recurrence]))
    const linkedEntries = [
      ...(Array.isArray(data.transactions) ? data.transactions.map((record) => ({ record, kind: 'transaction' })) : []),
      ...(Array.isArray(data.transfers) ? data.transfers.map((record) => ({ record, kind: 'transfer' })) : []),
    ].filter(({ record }) => record?.recurrenceId || record?.recurrenceOccurrenceId || record?.generatedFromRecurrence)
    const duplicateSchedules = duplicateValues(linkedEntries.map(({ record, kind }) => record?.recurrenceId && isValidAccountDate(record?.scheduledOccurrenceDate)
      ? `${record.recurrenceId}:${record.recurrenceType || (kind === 'transfer' ? 'transfer' : record.type)}:${record.scheduledOccurrenceDate}`
      : ''))
    if (duplicateSchedules.length) errors.push(`Existem ocorrências recorrentes duplicadas por série, tipo e data: ${duplicateSchedules.join(', ')}.`)
    const inconsistentEntries = linkedEntries.filter(({ record, kind }) => {
      const recurrence = recurrenceById.get(record?.recurrenceId)
      if (!recurrence) return false
      return (recurrence.type === 'transfer' && kind !== 'transfer') || (recurrence.type !== 'transfer' && kind === 'transfer') || (record.recurrenceType !== undefined && record.recurrenceType !== recurrence.type)
    })
    if (inconsistentEntries.length) errors.push(`Existem ${inconsistentEntries.length} ocorrência(s) com tipo incompatível com sua recorrência.`)
    const afterEndDate = linkedEntries.filter(({ record }) => {
      const recurrence = recurrenceById.get(record?.recurrenceId)
      return recurrence?.endDate && isValidAccountDate(record?.scheduledOccurrenceDate) && record.scheduledOccurrenceDate > recurrence.endDate
    })
    if (afterEndDate.length) errors.push(`Existem ${afterEndDate.length} ocorrência(s) após a data final de sua recorrência.`)
    const exceededLimits = data.recurrences.filter((recurrence) => recurrence?.occurrenceLimit != null && new Set(linkedEntries.filter(({ record }) => record?.recurrenceId === recurrence.recurrenceId).map(({ record }) => `${record?.recurrenceType || recurrence.type}:${record?.scheduledOccurrenceDate || record?.date || ''}`)).size > Number(recurrence.occurrenceLimit))
    if (exceededLimits.length) errors.push(`Existem recorrências acima do limite de ocorrências: ${exceededLimits.map((recurrence) => recurrence.recurrenceId).join(', ')}.`)
  }
  if (data.alertStates !== undefined) {
    if (!Array.isArray(data.alertStates)) errors.push('Lista de estados de alerta inv\u00e1lida.')
    else {
      data.alertStates.forEach((state, index) => validateAlertState(state, index, errors))
      const duplicateKeys = duplicateValues(data.alertStates.map((state) => state?.alertKey))
      if (duplicateKeys.length) errors.push(`Existem alertKey duplicados no backup: ${duplicateKeys.join(', ')}.`)
    }
  }
  if (!Array.isArray(data.categories) || data.categories.some((item) => typeof item !== 'string')) errors.push('Lista de categorias ausente ou inv\u00e1lida.')
  if (!Array.isArray(data.invoiceRecords)) errors.push('Lista de registros de faturas ausente ou inv\u00e1lida.')
  const storage = isObject(backup.storage) ? backup.storage : {}
  if (!Array.isArray(storage['clareza:transactions'])) errors.push('LocalStorage do backup: lan\u00e7amentos ausentes ou inv\u00e1lidos.')
  if (!Array.isArray(storage['clareza:cards'])) errors.push('LocalStorage do backup: cart\u00f5es ausentes ou inv\u00e1lidos.')
  if (storage['clareza:accounts'] !== undefined && !Array.isArray(storage['clareza:accounts'])) errors.push('LocalStorage do backup: contas inv\u00e1lidas.')
  if (storage['clareza:transfers'] !== undefined && !Array.isArray(storage['clareza:transfers'])) errors.push('LocalStorage do backup: transfer\u00eancias inv\u00e1lidas.')
  if (storage['clareza:recurrences'] !== undefined && !Array.isArray(storage['clareza:recurrences'])) errors.push('LocalStorage do backup: recorr\u00eancias inv\u00e1lidas.')
  if (storage['clareza:alertStates'] !== undefined && !Array.isArray(storage['clareza:alertStates'])) errors.push('LocalStorage do backup: estados de alerta inv\u00e1lidos.')
  if (Array.isArray(data.recurrences) && !Array.isArray(storage['clareza:recurrences'])) errors.push('LocalStorage do backup: recorr\u00eancias restaur\u00e1veis ausentes.')
  if (Array.isArray(data.alertStates) && !Array.isArray(storage['clareza:alertStates'])) errors.push('LocalStorage do backup: estados de alerta restaur\u00e1veis ausentes.')
  if (!Array.isArray(storage['clareza:categories'])) errors.push('LocalStorage do backup: categorias ausentes ou inv\u00e1lidas.')
  if (!Array.isArray(storage['clareza:invoices'])) errors.push('LocalStorage do backup: faturas ausentes ou inv\u00e1lidas.')
  if (Array.isArray(data.transactions) && Array.isArray(storage['clareza:transactions']) && JSON.stringify(data.transactions) !== JSON.stringify(storage['clareza:transactions'])) errors.push('Os lan\u00e7amentos do resumo n\u00e3o correspondem ao conte\u00fado restaur\u00e1vel.')
  if (Array.isArray(data.cards) && Array.isArray(storage['clareza:cards']) && JSON.stringify(data.cards) !== JSON.stringify(storage['clareza:cards'])) errors.push('Os cart\u00f5es do resumo n\u00e3o correspondem ao conte\u00fado restaur\u00e1vel.')
  if (Array.isArray(data.accounts) && Array.isArray(storage['clareza:accounts']) && JSON.stringify(data.accounts) !== JSON.stringify(storage['clareza:accounts'])) errors.push('As contas do resumo n\u00e3o correspondem ao conte\u00fado restaur\u00e1vel.')
  if (Array.isArray(data.transfers) && Array.isArray(storage['clareza:transfers']) && JSON.stringify(data.transfers) !== JSON.stringify(storage['clareza:transfers'])) errors.push('As transfer\u00eancias do resumo n\u00e3o correspondem ao conte\u00fado restaur\u00e1vel.')
  if (Array.isArray(data.recurrences) && Array.isArray(storage['clareza:recurrences']) && JSON.stringify(data.recurrences) !== JSON.stringify(storage['clareza:recurrences'])) errors.push('As recorr\u00eancias do resumo n\u00e3o correspondem ao conte\u00fado restaur\u00e1vel.')
  if (Array.isArray(data.alertStates) && Array.isArray(storage['clareza:alertStates']) && JSON.stringify(data.alertStates) !== JSON.stringify(storage['clareza:alertStates'])) errors.push('Os estados de alerta do resumo n\u00e3o correspondem ao conte\u00fado restaur\u00e1vel.')
  const financeVersion = Number(backup.metadata?.financeDataVersion)
  if (!Number.isInteger(financeVersion) || financeVersion < 0 || financeVersion > CURRENT_FINANCE_DATA_VERSION) errors.push(`Vers\u00e3o financeira incompat\u00edvel. M\u00e1xima suportada: ${CURRENT_FINANCE_DATA_VERSION}.`)
  if (errors.length > 50) return { valid: false, errors: [...errors.slice(0, 50), `Mais ${errors.length - 50} erro(s) omitido(s).`] }
  return { valid: errors.length === 0, errors }
}

export const parseAndValidateBackup = (text) => {
  try {
    const backup = JSON.parse(text)
    return { backup, ...validateBackup(backup) }
  } catch {
    return { backup: null, valid: false, errors: ['O arquivo est\u00e1 corrompido ou n\u00e3o cont\u00e9m JSON v\u00e1lido.'] }
  }
}
