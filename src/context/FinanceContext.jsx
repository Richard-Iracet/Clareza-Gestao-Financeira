import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { initialCategories } from '../data/categories'
import { initialCards } from '../data/cards'
import { initialTransactions } from '../data/expenses'
import { costCenters as defaultCostCenters } from '../data/settings'
import { assignTransactionToInvoice, buildInvoices, createRemainingCardInstallments, getInvoiceDates, isDuplicateInstallment } from '../utils/invoiceCalculations'
import { runInvoiceMigration } from '../utils/invoiceMigration'
import { appendInvoicePayment, reopenInvoiceRecord } from '../utils/invoiceReconciliation'
import { archiveInvoice, restoreInvoice } from '../utils/orphanInvoices'
import { INSTALLMENT_IDENTITY_MIGRATION_VERSION, migrateSafeInstallmentIdentities } from '../utils/identity'
import { removeConfirmedDuplicate } from '../utils/deduplication'
import { INSTALLMENT_VALUE_MIGRATION_VERSION, migrateSafeInstallmentValues, normalizeInstallmentValues } from '../utils/installmentValueCalculations'
import { applyTemporalAssignment } from '../utils/temporalAssignments'
import { createOfficialInvoiceRecord, INVOICE_DATE_MIGRATION_VERSION, migrateSafeInvoiceDates } from '../utils/invoiceDates'
import { addCardBillingConfiguration, CARD_BILLING_MIGRATION_VERSION, migrateLegacyCardConfigurations } from '../utils/cardBillingConfig'
import { stableStringify } from '../utils/snapshot'
import { getBrowserStorage, readStorage, STORAGE_KEYS, storage } from '../utils/storage'
import { defaultFilters, filterTransactions, filterTransfers } from '../utils/filtering'
import { buildFinanceIndexes, getInvoiceTransactionsFromIndex } from '../domain/transactions/transactionSelectors'
import { batchDeleteTransactions, batchUpdateTransactions, deleteTransactionByScope, toggleCashTransactionStatus } from '../domain/transactions/transactionService'
import { loadFinanceState } from '../infrastructure/storage/financeRepository'
import usePersistenceQueue from '../application/hooks/usePersistenceQueue'
import { ACCOUNT_MIGRATION_VERSION, migrateAccountsState } from '../utils/accountMigration'
import { archiveAccount as archiveAccountRecord, createAccount, deleteAccountSafely, isValidAccountDate, restoreAccount as restoreAccountRecord, updateAccount as updateAccountRecord } from '../domain/accounts/accountService'
import { TRANSFER_MIGRATION_VERSION, migrateTransfersState } from '../utils/transferMigration'
import { cancelScheduledTransfer as cancelScheduledTransferRecord, completeScheduledTransfer as completeScheduledTransferRecord, createTransfer as createTransferRecord, getTransferOperationIds, reverseCompletedTransfer as reverseCompletedTransferRecord, updateScheduledTransfer as updateScheduledTransferRecord } from '../domain/transfers/transferService'
import { RECURRENCE_MIGRATION_VERSION, migrateRecurrencesState } from '../utils/recurrenceMigration'
import { advanceRecurrenceAfterGeneration, buildRecurrenceIndexes, createRecurrence as createRecurrenceRecord, deleteRecurrence as deleteRecurrenceRecord, detachRecurrenceOccurrence, getNextOccurrenceDate, getRecurrenceOccurrenceKey, getRecurrenceOccurrenceOperationId, pauseRecurrence as pauseRecurrenceRecord, planRecurrenceOccurrences, resumeRecurrence as resumeRecurrenceRecord, completeRecurrence as completeRecurrenceRecord, cancelRecurrence as cancelRecurrenceRecord, updateRecurrence as updateRecurrenceRecord } from '../domain/recurrences/recurrenceService'
import { buildFinanceAlerts, dismissAlert as dismissAlertState, markAlertRead as markAlertReadState, snoozeAlert as snoozeAlertState } from '../domain/alerts/alertSelectors'

const FinanceContext = createContext(null)
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const accountAssignment = (transaction) => transaction.cardId
  ? { accountId: null, accountAssignmentStatus: 'not-applicable' }
  : transaction.accountId
    ? { accountId: transaction.accountId, accountAssignmentStatus: 'assigned' }
    : { accountId: null, accountAssignmentStatus: transaction.accountAssignmentStatus || (hasOwn(transaction, 'accountId') ? 'unassigned' : 'legacy-unassigned') }
const localFinancialDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const appendRecurrenceAudit = (recurrence, type, operationId, createdAt = new Date().toISOString(), details = {}) => ({
  ...recurrence,
  audit: [...(recurrence.audit || []).slice(-49), { eventId: uid(), operationId: operationId || null, type, createdAt, ...details }],
})
const recurrenceOccurrenceFields = ['recurrenceId', 'recurrenceType', 'recurrenceOccurrenceId', 'scheduledOccurrenceDate', 'generatedFromRecurrence', 'recurrenceVersion']
const isGeneratedRecurrenceOccurrence = (record) => Boolean(record?.recurrenceId && record?.generatedFromRecurrence)
const detachForManualOccurrenceEdit = (record, operationId, createdAt = new Date().toISOString()) => {
  if (!isGeneratedRecurrenceOccurrence(record)) return record
  return {
    ...record,
    detachedFromRecurrence: true,
    recurrenceDetachedAt: record.recurrenceDetachedAt || createdAt,
    updatedAt: createdAt,
    recurrenceOccurrenceAudit: [...(record.recurrenceOccurrenceAudit || []).slice(-49), { eventId: uid(), operationId, type: 'recurrence_occurrence_edited', createdAt }],
  }
}

export function FinanceProvider({ children, hasLocalState = true }) {
  const migration = useMemo(() => runInvoiceMigration(initialTransactions, initialCards), [])
  const backend = useMemo(() => getBrowserStorage(), [])
  const bootstrap = useMemo(() => loadFinanceState(backend, {
    transactions: migration.transactions, cards: migration.cards, accounts: storage.getAccounts([]), transfers: storage.getTransfers([]), recurrences: storage.getRecurrences([]), alertStates: storage.getAlertStates([]), categories: storage.getCategories(initialCategories), invoiceRecords: storage.getInvoicePayments([]), costCenters: defaultCostCenters,
    filters: readStorage(STORAGE_KEYS.filters, defaultFilters, backend).data || defaultFilters, userSettings: readStorage(STORAGE_KEYS.userSettings, {}, backend).data || {}, migrations: { financeDataVersion: storage.getDataVersion() },
  }), [backend, migration])
  const resolvedData = bootstrap.success ? bootstrap.snapshot.data : { transactions: migration.transactions, cards: migration.cards, accounts: storage.getAccounts([]), transfers: storage.getTransfers([]), recurrences: storage.getRecurrences([]), alertStates: storage.getAlertStates([]), categories: storage.getCategories(initialCategories), invoiceRecords: storage.getInvoicePayments([]), filters: defaultFilters }
  const accountsWereMissing = !Array.isArray(resolvedData.accounts)
  const transfersWereMissing = !Array.isArray(resolvedData.transfers)
  const recurrencesWereMissing = !Array.isArray(resolvedData.recurrences)
  const alertStatesWereMissing = !Array.isArray(resolvedData.alertStates)
  const initialData = { ...resolvedData, accounts: Array.isArray(resolvedData.accounts) ? resolvedData.accounts : [], transfers: Array.isArray(resolvedData.transfers) ? resolvedData.transfers : [], recurrences: Array.isArray(resolvedData.recurrences) ? resolvedData.recurrences : [], alertStates: Array.isArray(resolvedData.alertStates) ? resolvedData.alertStates : [] }
  const [cards, setCards] = useState(initialData.cards)
  const [accounts, setAccounts] = useState(initialData.accounts)
  const [transfers, setTransfers] = useState(initialData.transfers)
  const [recurrences, setRecurrences] = useState(initialData.recurrences)
  const [alertStates, setAlertStates] = useState(initialData.alertStates)
  const [transactions, setTransactions] = useState(initialData.transactions)
  const [invoicePayments, setInvoicePayments] = useState(initialData.invoiceRecords)
  const [categories, setCategories] = useState(initialData.categories)
  const [storedCostCenters, setStoredCostCenters] = useState(Array.isArray(initialData.costCenters) ? initialData.costCenters : defaultCostCenters)
  const [filters, setFilters] = useState({ ...defaultFilters, ...(initialData.filters || {}) })
  const [userSettings, setUserSettings] = useState(initialData.userSettings && typeof initialData.userSettings === 'object' && !Array.isArray(initialData.userSettings) ? initialData.userSettings : {})
  const [migrationMetadata, setMigrationMetadata] = useState(initialData.migrations || {})
  const { persistence, setPersistence, setRecoveryOverride, stateRef, initialFingerprintRef, enqueuePersistence, retryPersistence } = usePersistenceQueue({ backend, migrationError: migration.error, bootstrap, initialData })
  const processedOperationsRef = useRef(new Set(initialData.transactions.map((item) => item.operationId).filter(Boolean)))
  const processedAccountOperationsRef = useRef(new Set([
    ...initialData.accounts.flatMap((account) => (account.audit || []).map((entry) => entry.operationId).filter(Boolean)),
    ...(initialData.migrations?.audit || []).map((entry) => entry.operationId).filter(Boolean),
  ]))
  const processedInvoicePaymentOperationsRef = useRef(new Set(initialData.invoiceRecords.flatMap((record) => (record.paymentHistory || []).map((payment) => payment.operationId).filter(Boolean))))
  const processedTransferOperationsRef = useRef(new Set(initialData.transfers.flatMap((transfer) => getTransferOperationIds(transfer))))
  const processedRecurrenceOperationsRef = useRef(new Set(initialData.recurrences.flatMap((recurrence) => (recurrence.audit || []).map((entry) => entry.operationId).filter(Boolean))))
  const pendingTransferPersistenceRef = useRef(null)
  const pendingRecurrencePersistenceRef = useRef(null)
  const automaticRecurrenceGenerationRef = useRef(false)
  const hasPendingFinancialMutation = () => Boolean(pendingTransferPersistenceRef.current || pendingRecurrencePersistenceRef.current)
  const pendingFinancialMutationResult = () => ({ success: false, errorCode: 'FINANCIAL_PERSISTENCE_PENDING', message: 'Aguarde a confirmação da operação financeira anterior antes de continuar.' })
  const invoices = useMemo(() => buildInvoices(transactions, cards, invoicePayments), [transactions, cards, invoicePayments])
  const invoiceStatusMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice.status])), [invoices])
  const recurrenceIndexes = useMemo(() => buildRecurrenceIndexes({ transactions, transfers }), [transactions, transfers])
  const indexes = useMemo(() => buildFinanceIndexes({ transactions, cards, accounts, invoices, categories, recurrences }), [transactions, cards, accounts, invoices, categories, recurrences])
  const alerts = useMemo(() => buildFinanceAlerts({ transactions, transfers, invoices, invoiceRecords: invoicePayments, accounts, cards, recurrences, alertStates }).visible, [transactions, transfers, invoices, invoicePayments, accounts, cards, recurrences, alertStates])
  const financeState = useMemo(() => ({
    transactions, cards, accounts, transfers, recurrences, alertStates, categories,
    invoiceRecords: invoicePayments, costCenters: storedCostCenters, filters,
    userSettings, migrations: migrationMetadata,
  }), [transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments, storedCostCenters, filters, userSettings, migrationMetadata])

  const startEmptyAfterConfirmation = useCallback(() => { setTransactions([]); setCards([]); setAccounts([]); setTransfers([]); setRecurrences([]); setAlertStates([]); setCategories([]); setInvoicePayments([]); setFilters(defaultFilters); setRecoveryOverride(true); setPersistence((value) => ({ ...value, status: 'unsaved', pendingChanges: true, errorType: null, message: 'Estado vazio confirmado; aguardando persistência.' })) }, [])
  const replaceFinanceState = useCallback((data) => {
    setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
    setCards(Array.isArray(data.cards) ? data.cards : [])
    setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    setTransfers(Array.isArray(data.transfers) ? data.transfers : [])
    setRecurrences(Array.isArray(data.recurrences) ? data.recurrences : [])
    setAlertStates(Array.isArray(data.alertStates) ? data.alertStates : [])
    setCategories(Array.isArray(data.categories) ? data.categories : [])
    setInvoicePayments(Array.isArray(data.invoiceRecords) ? data.invoiceRecords : [])
    setStoredCostCenters(Array.isArray(data.costCenters) ? data.costCenters : defaultCostCenters)
    setFilters({ ...defaultFilters, ...(data.filters || {}) })
    setUserSettings(data.userSettings && typeof data.userSettings === 'object' && !Array.isArray(data.userSettings) ? data.userSettings : {})
    setMigrationMetadata(data.migrations || {})
  }, [])

  useEffect(() => {
    const complete = { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoiceRecords: invoicePayments, costCenters: storedCostCenters, filters, userSettings, migrations: migrationMetadata }
    stateRef.current = complete
    if (initialFingerprintRef.current && stableStringify(complete) === initialFingerprintRef.current) return
    initialFingerprintRef.current = null
    enqueuePersistence(complete)
  }, [transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments, storedCostCenters, filters, userSettings, migrationMetadata, enqueuePersistence])
  useEffect(() => {
    setTransactions((current) => {
      let changed = false
      const synchronized = current.map((item) => {
        if (!item.invoiceId) return item
        const invoiceStatus = invoiceStatusMap.get(item.invoiceId)
        if (!invoiceStatus || item.invoiceStatus === invoiceStatus) return item
        changed = true
        return { ...item, invoiceStatus }
      })
      return changed ? synchronized : current
    })
  }, [invoiceStatusMap])
  useEffect(() => {
    if (Number(migrationMetadata.accountMigrationVersion || 0) >= ACCOUNT_MIGRATION_VERSION) return
    const result = migrateAccountsState(accountsWereMissing ? { transactions } : { accounts, transactions })
    if (result.report.accountsIntroduced) setAccounts(result.state.accounts)
    setMigrationMetadata((current) => Number(current.accountMigrationVersion || 0) >= ACCOUNT_MIGRATION_VERSION ? current : ({
      ...current,
      accountMigrationVersion: ACCOUNT_MIGRATION_VERSION,
      accountMigratedAt: new Date().toISOString(),
      accountMigrationReport: result.report,
    }))
  }, [accounts, accountsWereMissing, migrationMetadata.accountMigrationVersion, transactions])
  useEffect(() => {
    if (Number(migrationMetadata.transferMigrationVersion || 0) >= TRANSFER_MIGRATION_VERSION) return
    const result = migrateTransfersState(transfersWereMissing ? {} : { transfers })
    if (result.report.transfersIntroduced) setTransfers(result.state.transfers)
    setMigrationMetadata((current) => Number(current.transferMigrationVersion || 0) >= TRANSFER_MIGRATION_VERSION ? current : ({
      ...current,
      transferMigrationVersion: TRANSFER_MIGRATION_VERSION,
      transferMigratedAt: new Date().toISOString(),
      transferMigrationReport: result.report,
    }))
  }, [migrationMetadata.transferMigrationVersion, transfers, transfersWereMissing])
  useEffect(() => {
    if (Number(migrationMetadata.recurrenceMigrationVersion || 0) >= RECURRENCE_MIGRATION_VERSION) return
    const result = migrateRecurrencesState({
      ...(recurrencesWereMissing ? {} : { recurrences }),
      ...(alertStatesWereMissing ? {} : { alertStates }),
    })
    if (result.report.recurrencesIntroduced) setRecurrences(result.state.recurrences)
    if (result.report.alertStatesIntroduced) setAlertStates(result.state.alertStates)
    setMigrationMetadata((current) => Number(current.recurrenceMigrationVersion || 0) >= RECURRENCE_MIGRATION_VERSION ? current : ({
      ...current,
      recurrenceMigrationVersion: RECURRENCE_MIGRATION_VERSION,
      recurrenceMigratedAt: new Date().toISOString(),
      recurrenceMigrationReport: result.report,
    }))
  }, [alertStates, alertStatesWereMissing, migrationMetadata.recurrenceMigrationVersion, recurrences, recurrencesWereMissing])
  useEffect(() => {
    const pending = pendingTransferPersistenceRef.current
    if (!pending) return
    if (persistence.status === 'error') {
      pendingTransferPersistenceRef.current = null
      processedTransferOperationsRef.current.delete(pending.operationId)
      setTransfers(pending.previousTransfers)
      return
    }
    if (persistence.status === 'unsaved' && pending.observedPersistenceAttempt) {
      pendingTransferPersistenceRef.current = null
      return
    }
    if (persistence.status === 'saving' || persistence.pendingChanges) {
      pending.observedPersistenceAttempt = true
      return
    }
    if (persistence.status === 'synced' && pending.observedPersistenceAttempt) pendingTransferPersistenceRef.current = null
  }, [persistence.pendingChanges, persistence.status])
  useEffect(() => {
    const pending = pendingRecurrencePersistenceRef.current
    if (!pending) return
    if (persistence.status === 'error') {
      pendingRecurrencePersistenceRef.current = null
      pending.transactionOperationIds.forEach((operationId) => processedOperationsRef.current.delete(operationId))
      pending.transferOperationIds.forEach((operationId) => processedTransferOperationsRef.current.delete(operationId))
      pending.recurrenceOperationIds.forEach((operationId) => processedRecurrenceOperationsRef.current.delete(operationId))
      setTransactions(pending.previousTransactions)
      setTransfers(pending.previousTransfers)
      setRecurrences(pending.previousRecurrences)
      setInvoicePayments(pending.previousInvoicePayments)
      setAlertStates(pending.previousAlertStates)
      return
    }
    if (persistence.status === 'unsaved' && pending.observedPersistenceAttempt) {
      pendingRecurrencePersistenceRef.current = null
      return
    }
    if (persistence.status === 'saving' || persistence.pendingChanges) {
      pending.observedPersistenceAttempt = true
      return
    }
    if (persistence.status === 'synced' && pending.observedPersistenceAttempt) pendingRecurrencePersistenceRef.current = null
  }, [persistence.pendingChanges, persistence.status])

  const addTransaction = (transaction, options = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    if (transaction.operationId && processedOperationsRef.current.has(transaction.operationId)) return { success: false, duplicateOperation: true }
    const card = transaction.cardId ? cards.find((item) => item.id === transaction.cardId) : null
    if (transaction.type === 'expense' && transaction.paymentMethod === 'Crédito' && card) {
      const generated = createRemainingCardInstallments(transaction, card).map((item) => ({ ...item, ...accountAssignment({ ...item, cardId: card.id }) })).filter((item) => !isDuplicateInstallment(item, transactions))
      const paidConflicts = [...new Set(generated.map((item) => item.invoiceId))].map((invoiceId) => invoices.find((invoice) => invoice.id === invoiceId && invoice.status === 'paid')).filter(Boolean)
      if (paidConflicts.length && !options.reopenPaidInvoice) return { requiresReopen: true, invoice: paidConflicts[0], transaction }
      if (paidConflicts.length) setInvoicePayments((current) => { const conflictIds = new Set(paidConflicts.map((item) => item.id)); const updated = current.map((record) => { const invoice = paidConflicts.find((item) => item.id === record.id); return invoice ? reopenInvoiceRecord(record, invoice, generated.find((item) => item.invoiceId === invoice.id)?.id) : record }); paidConflicts.forEach((invoice) => { if (!current.some((record) => record.id === invoice.id)) updated.push(reopenInvoiceRecord({}, invoice, generated.find((item) => item.invoiceId === invoice.id)?.id)) }); return updated.filter((record, index, all) => !conflictIds.has(record.id) || all.findIndex((item) => item.id === record.id) === index) })
      setInvoicePayments((current) => { const next = [...current]; generated.forEach((item) => { if (!next.some((record) => record.id === item.invoiceId)) next.push(createOfficialInvoiceRecord(item, card)) }); return next })
      setTransactions((current) => [...generated, ...current])
      if (transaction.operationId) processedOperationsRef.current.add(transaction.operationId)
      return { success: true }
    }
    const account = transaction.accountId ? accounts.find((item) => item.accountId === transaction.accountId) : null
    if (transaction.accountId && (!account || account.archived)) return { success: false, errorCode: 'INVALID_ACCOUNT_REFERENCE', message: 'Selecione uma conta ativa ou deixe a conta financeira em branco.' }
    setTransactions((current) => [{ ...transaction, cardId: null, invoiceId: null, ...accountAssignment(transaction), amount: Number(transaction.amount), id: uid(), createdAt: new Date().toISOString(), source: transaction.source || 'manual' }, ...current])
    if (transaction.operationId) processedOperationsRef.current.add(transaction.operationId)
    return { success: true }
  }

  const updateTransaction = (id, changes) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const existing = transactions.find((item) => item.id === id)
    if (!existing) return { success: false, errorCode: 'TRANSACTION_NOT_FOUND' }
    const candidate = { ...existing, ...changes }
    const occurrenceEditOperationId = isGeneratedRecurrenceOccurrence(existing) ? uid() : null
    const account = !existing.cardId && candidate.accountId ? accounts.find((item) => item.accountId === candidate.accountId) : null
    if (!existing.cardId && candidate.accountId && (!account || account.archived)) return { success: false, errorCode: 'INVALID_ACCOUNT_REFERENCE', message: 'A conta financeira selecionada n\u00e3o est\u00e1 ativa.' }
    setTransactions((current) => {
    const target = current.find((item) => item.id === id)
    const { recalculateInvoice, temporalMode, confirmPaidTemporal, editScope = 'single', ...safeChanges } = changes
    recurrenceOccurrenceFields.forEach((field) => delete safeChanges[field])
    if (target?.cardId && temporalMode && safeChanges.date !== target.date) {
      const card = cards.find((value) => value.id === target.cardId); const result = applyTemporalAssignment(current, id, safeChanges, card, { mode: temporalMode, scope: editScope, confirmPaid: confirmPaidTemporal })
      if (result.requiresConfirmation) return current
      return result.transactions.map((item) => item.id === id ? detachForManualOccurrenceEdit(item, occurrenceEditOperationId) : item)
    }
    if (target?.installmentGroupId && editScope === 'future') {
      const sharedFields = ['description', 'amount', 'category', 'costCenter', 'necessity', 'notes']
      return current.map((item) => {
        if (item.installmentGroupId !== target.installmentGroupId || Number(item.installmentNumber) < Number(target.installmentNumber)) return item
        const updates = Object.fromEntries(sharedFields.filter((field) => safeChanges[field] !== undefined).map((field) => [field, field === 'amount' ? Number(safeChanges[field]) : safeChanges[field]]))
        const updatedInstallment = updates.amount !== undefined ? normalizeInstallmentValues({ ...item, ...updates, valueInputMode: 'installment' }, { inputAmount: updates.amount }) : { ...item, ...updates }
        return detachForManualOccurrenceEdit(updatedInstallment, item.id === id ? occurrenceEditOperationId : uid())
      })
    }
    return current.map((item) => {
      if (item.id !== id) return item
      const changed = { ...item, ...safeChanges, amount: safeChanges.amount === undefined ? item.amount : Number(safeChanges.amount) }
      const assigned = { ...changed, ...accountAssignment(changed) }
      const updated = Number(assigned.installmentTotal) > 1 ? normalizeInstallmentValues(assigned, { inputAmount: assigned.amount }) : assigned
      if (!recalculateInvoice || !updated.cardId) return detachForManualOccurrenceEdit(updated, occurrenceEditOperationId)
      const card = cards.find((value) => value.id === updated.cardId)
      return detachForManualOccurrenceEdit(card ? assignTransactionToInvoice(updated, card, 'automatic') : updated, occurrenceEditOperationId)
    })
    })
    return { success: true }
  }
  const deleteTransaction = (id, scope = 'single') => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const target = transactions.find((item) => item.id === id)
    const recurrence = target?.recurrenceId ? recurrences.find((item) => item.recurrenceId === target.recurrenceId) : null
    const occurrenceKey = target?.recurrenceOccurrenceId || getRecurrenceOccurrenceKey(target?.recurrenceId, target?.scheduledOccurrenceDate || target?.date, target?.recurrenceType || target?.type)
    if (isGeneratedRecurrenceOccurrence(target) && recurrence && occurrenceKey) {
      const operationId = uid()
      const updatedRecurrence = appendRecurrenceAudit({ ...recurrence, cancelledOccurrenceKeys: [...new Set([...(recurrence.cancelledOccurrenceKeys || []), occurrenceKey])] }, 'recurrence_occurrence_cancelled', operationId, undefined, { recurrenceOccurrenceId: occurrenceKey })
      stageRecurrenceMutation({ ...recurrenceState(), transactions: deleteTransactionByScope(transactions, id, scope), recurrences: recurrences.map((item) => item.recurrenceId === recurrence.recurrenceId ? updatedRecurrence : item) }, { recurrenceOperationIds: [operationId] })
      return { success: true, cancelledOccurrence: true, persistencePending: true }
    }
    setTransactions((current) => deleteTransactionByScope(current, id, scope))
    return { success: true }
  }
  const bulkUpdateTransactions = (ids, changes) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const selected = new Set(ids)
    setTransactions((current) => batchUpdateTransactions(current, ids, changes).map((item) => selected.has(item.id) ? detachForManualOccurrenceEdit(item, uid()) : item))
    return { success: true }
  }
  const bulkDeleteTransactions = (ids) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const selected = new Set(ids)
    const cancelledByRule = new Map()
    transactions.filter((item) => selected.has(item.id) && isGeneratedRecurrenceOccurrence(item)).forEach((item) => {
      const key = item.recurrenceOccurrenceId || getRecurrenceOccurrenceKey(item.recurrenceId, item.scheduledOccurrenceDate || item.date, item.recurrenceType || item.type)
      if (key && recurrences.some((rule) => rule.recurrenceId === item.recurrenceId)) cancelledByRule.set(item.recurrenceId, [...(cancelledByRule.get(item.recurrenceId) || []), key])
    })
    if (cancelledByRule.size) {
      const operationId = uid()
      const nextRecurrences = recurrences.map((recurrence) => !cancelledByRule.has(recurrence.recurrenceId) ? recurrence : appendRecurrenceAudit({ ...recurrence, cancelledOccurrenceKeys: [...new Set([...(recurrence.cancelledOccurrenceKeys || []), ...cancelledByRule.get(recurrence.recurrenceId)])] }, 'recurrence_occurrences_cancelled', operationId, undefined, { count: cancelledByRule.get(recurrence.recurrenceId).length }))
      stageRecurrenceMutation({ ...recurrenceState(), transactions: batchDeleteTransactions(transactions, ids), recurrences: nextRecurrences }, { recurrenceOperationIds: [operationId] })
      return { success: true, cancelledOccurrences: true, persistencePending: true }
    }
    setTransactions((current) => batchDeleteTransactions(current, ids))
    return { success: true }
  }
  const togglePaid = (id) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const operationId = uid()
    setTransactions((current) => toggleCashTransactionStatus(current, id).map((item) => item.id === id && isGeneratedRecurrenceOccurrence(item)
      ? { ...item, recurrenceOccurrenceAudit: [...(item.recurrenceOccurrenceAudit || []).slice(-49), { eventId: uid(), operationId, type: item.status === 'pending' ? 'recurrence_occurrence_reopened' : 'recurrence_occurrence_realized', createdAt: new Date().toISOString() }] }
      : item))
    return { success: true }
  }
  const appendAccountAudit = (entry) => setMigrationMetadata((current) => ({
    ...current,
    audit: [...(current.audit || []).slice(-49), entry],
  }))
  const addAccount = (input, options = {}) => {
    const operationId = options.operationId || uid()
    if (processedAccountOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true }
    const result = createAccount(input, { ...options, operationId })
    if (!result.success) return result
    if (accounts.some((account) => account.accountId === result.account.accountId)) return { success: false, errorCode: 'DUPLICATE_ACCOUNT_ID' }
    setAccounts((current) => [...current, result.account])
    processedAccountOperationsRef.current.add(operationId)
    return { ...result, operationId }
  }
  const updateAccount = (accountId, changes, options = {}) => {
    const operationId = options.operationId || uid()
    if (processedAccountOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true }
    const result = updateAccountRecord(accounts.find((account) => account.accountId === accountId), changes, { ...options, operationId })
    if (!result.success) return result
    setAccounts((current) => current.map((account) => account.accountId === accountId ? result.account : account))
    processedAccountOperationsRef.current.add(operationId)
    return { ...result, operationId }
  }
  const archiveAccount = (accountId, options = {}) => {
    const operationId = options.operationId || uid()
    if (processedAccountOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true }
    const result = archiveAccountRecord(accounts.find((account) => account.accountId === accountId), { ...options, operationId })
    if (!result.success) return result
    if (!result.alreadyArchived) setAccounts((current) => current.map((account) => account.accountId === accountId ? result.account : account))
    processedAccountOperationsRef.current.add(operationId)
    return { ...result, operationId }
  }
  const restoreAccount = (accountId, options = {}) => {
    const operationId = options.operationId || uid()
    if (processedAccountOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true }
    const result = restoreAccountRecord(accounts.find((account) => account.accountId === accountId), { ...options, operationId })
    if (!result.success) return result
    if (!result.alreadyRestored) setAccounts((current) => current.map((account) => account.accountId === accountId ? result.account : account))
    processedAccountOperationsRef.current.add(operationId)
    return { ...result, operationId }
  }
  const deleteAccount = (accountId, options = {}) => {
    const operationId = options.operationId || uid()
    if (processedAccountOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true }
    const result = deleteAccountSafely(accounts, accountId, transactions, invoicePayments, transfers, recurrences)
    if (!result.success) return result
    setAccounts(result.accounts)
    processedAccountOperationsRef.current.add(operationId)
    appendAccountAudit({ eventId: uid(), operationId, type: 'account_deleted', accountId, createdAt: new Date().toISOString() })
    return { ...result, operationId }
  }
  const addTransfer = (input, options = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    if (pendingTransferPersistenceRef.current) return { success: false, errorCode: 'TRANSFER_PERSISTENCE_PENDING', errors: ['Aguarde a confirma\u00e7\u00e3o da transfer\u00eancia anterior antes de criar outra.'] }
    const operationId = options.operationId || uid()
    if (processedTransferOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = createTransferRecord(input, { ...options, operationId, accounts, existingTransfers: transfers })
    if (!result.success) return result
    pendingTransferPersistenceRef.current = { previousTransfers: transfers, operationId, observedPersistenceAttempt: false }
    setTransfers([...transfers, result.transfer])
    getTransferOperationIds(result.transfer).forEach((id) => processedTransferOperationsRef.current.add(id))
    return { ...result, operationId, persistencePending: true }
  }
  const updateScheduledTransfer = (transferId, changes, options = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    if (pendingTransferPersistenceRef.current) return { success: false, errorCode: 'TRANSFER_PERSISTENCE_PENDING', errors: ['Aguarde a confirma\u00e7\u00e3o da transfer\u00eancia anterior antes de alterar outra.'] }
    const operationId = options.operationId || uid()
    if (processedTransferOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = updateScheduledTransferRecord(transfers.find((transfer) => transfer.transferId === transferId), changes, { ...options, operationId, accounts, existingTransfers: transfers })
    if (!result.success) return result
    const editedTransfer = detachForManualOccurrenceEdit(result.transfer, operationId)
    pendingTransferPersistenceRef.current = { previousTransfers: transfers, operationId, observedPersistenceAttempt: false }
    setTransfers(transfers.map((transfer) => transfer.transferId === transferId ? editedTransfer : transfer))
    processedTransferOperationsRef.current.add(operationId)
    return { ...result, transfer: editedTransfer, persistencePending: true }
  }
  const completeTransfer = (transferId, options = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    if (pendingTransferPersistenceRef.current) return { success: false, errorCode: 'TRANSFER_PERSISTENCE_PENDING', errors: ['Aguarde a confirma\u00e7\u00e3o da transfer\u00eancia anterior antes de concluir outra.'] }
    const operationId = options.operationId || uid()
    if (processedTransferOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = completeScheduledTransferRecord(transfers.find((transfer) => transfer.transferId === transferId), { ...options, operationId, accounts, existingTransfers: transfers })
    if (!result.success) return result
    pendingTransferPersistenceRef.current = { previousTransfers: transfers, operationId, observedPersistenceAttempt: false }
    setTransfers(transfers.map((transfer) => transfer.transferId === transferId ? result.transfer : transfer))
    processedTransferOperationsRef.current.add(operationId)
    return { ...result, persistencePending: true }
  }
  const cancelTransfer = (transferId, options = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    if (pendingTransferPersistenceRef.current) return { success: false, errorCode: 'TRANSFER_PERSISTENCE_PENDING', errors: ['Aguarde a confirma\u00e7\u00e3o da transfer\u00eancia anterior antes de cancelar outra.'] }
    const operationId = options.operationId || uid()
    if (processedTransferOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = cancelScheduledTransferRecord(transfers.find((transfer) => transfer.transferId === transferId), { ...options, operationId, accounts, existingTransfers: transfers })
    if (!result.success) return result
    pendingTransferPersistenceRef.current = { previousTransfers: transfers, operationId, observedPersistenceAttempt: false }
    setTransfers(transfers.map((transfer) => transfer.transferId === transferId ? result.transfer : transfer))
    processedTransferOperationsRef.current.add(operationId)
    return { ...result, persistencePending: true }
  }
  const reverseTransfer = (transferId, input, options = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    if (pendingTransferPersistenceRef.current) return { success: false, errorCode: 'TRANSFER_PERSISTENCE_PENDING', errors: ['Aguarde a confirma\u00e7\u00e3o da transfer\u00eancia anterior antes de estornar outra.'] }
    const operationId = options.operationId || uid()
    if (processedTransferOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = reverseCompletedTransferRecord(transfers.find((transfer) => transfer.transferId === transferId), input, { ...options, operationId, accounts, existingTransfers: transfers })
    if (!result.success) return result
    pendingTransferPersistenceRef.current = { previousTransfers: transfers, operationId, observedPersistenceAttempt: false }
    setTransfers(transfers.map((transfer) => transfer.transferId === transferId ? result.transfer : transfer))
    getTransferOperationIds(result.transfer).forEach((id) => processedTransferOperationsRef.current.add(id))
    return { ...result, persistencePending: true }
  }
  const stageRecurrenceMutation = (next, details = {}) => {
    const transactionOperationIds = [...new Set(details.transactionOperationIds || [])]
    const transferOperationIds = [...new Set(details.transferOperationIds || [])]
    const recurrenceOperationIds = [...new Set(details.recurrenceOperationIds || [])]
    pendingRecurrencePersistenceRef.current = {
      previousTransactions: transactions,
      previousTransfers: transfers,
      previousRecurrences: recurrences,
      previousInvoicePayments: invoicePayments,
      previousAlertStates: alertStates,
      transactionOperationIds,
      transferOperationIds,
      recurrenceOperationIds,
      observedPersistenceAttempt: false,
    }
    setTransactions(next.transactions)
    setTransfers(next.transfers)
    setRecurrences(next.recurrences)
    setInvoicePayments(next.invoicePayments)
    setAlertStates(next.alertStates)
    transactionOperationIds.forEach((operationId) => processedOperationsRef.current.add(operationId))
    transferOperationIds.forEach((operationId) => processedTransferOperationsRef.current.add(operationId))
    recurrenceOperationIds.forEach((operationId) => processedRecurrenceOperationsRef.current.add(operationId))
  }
  const recurrenceState = () => ({ transactions, transfers, recurrences, invoicePayments, alertStates })
  const invalidRecurrenceCategory = (input) => input?.type !== 'transfer' && input?.category && !categories.includes(input.category)
    ? { success: false, errorCode: 'INVALID_RECURRENCE_CATEGORY', errors: ['A categoria selecionada não existe mais. Escolha uma categoria válida ou deixe o campo vazio.'] }
    : null
  const generateRecurrenceOccurrences = (options = {}) => {
    if (pendingTransferPersistenceRef.current) return pendingFinancialMutationResult()
    if (pendingRecurrencePersistenceRef.current) return { success: false, errorCode: 'RECURRENCE_PERSISTENCE_PENDING', errors: ['Aguarde a confirmação da alteração recorrente anterior antes de gerar novamente.'] }
    const operationId = options.operationId || uid()
    if (processedRecurrenceOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    let nextTransactions = [...transactions]
    let nextTransfers = [...transfers]
    let nextRecurrences = [...recurrences]
    let nextInvoicePayments = [...invoicePayments]
    const transactionOperationIds = []
    const transferOperationIds = []
    const failures = []
    let generatedCount = 0
    let changed = false
    const at = new Date().toISOString()
    const paidInvoiceIds = new Set([
      ...invoices.filter((invoice) => invoice.status === 'paid').map((invoice) => invoice.id),
      ...nextInvoicePayments.filter((record) => record.status === 'paid' && !record.reopenedAt).map((record) => record.id),
    ])
    nextRecurrences.forEach((recurrence, index) => {
      if (options.automaticOnly && recurrence.generationMode !== 'automatic') return
      const plan = planRecurrenceOccurrences(recurrence, {
        transactions: nextTransactions,
        transfers: nextTransfers,
        referenceDate: options.referenceDate || new Date(),
        // A user-initiated run is the explicit action required for a manual
        // rule. Startup generation remains limited to automatic rules.
        force: options.automaticOnly ? Boolean(options.force) : options.force !== false,
      })
      if (!plan.success) {
        const message = plan.errors?.join(' ') || 'Não foi possível planejar as ocorrências desta recorrência.'
        nextRecurrences[index] = appendRecurrenceAudit({ ...recurrence, generationError: message, generationFailedAt: at }, 'recurrence_generation_failed', operationId, at, { reason: plan.errorCode || 'INVALID_PLAN' })
        failures.push({ recurrenceId: recurrence.recurrenceId, message })
        changed = true
        return
      }
      if (plan.skipped || (!plan.needsUpdate && !plan.occurrences.length)) return
      const plannedTransactions = []
      const plannedTransfers = []
      const plannedInvoicePayments = []
      const plannedTransactionOperationIds = []
      const plannedTransferOperationIds = []
      let failure = null
      for (const occurrence of plan.transactionOccurrences) {
        const occurrenceOperationId = getRecurrenceOccurrenceOperationId(recurrence.recurrenceId, occurrence.scheduledOccurrenceDate, recurrence.type)
        if (!occurrenceOperationId || processedOperationsRef.current.has(occurrenceOperationId)) {
          failure = 'A identidade técnica de uma ocorrência já foi processada sem um registro correspondente. Revise o diagnóstico antes de gerar novamente.'
          break
        }
        if (occurrence.cardId) {
          const card = cards.find((item) => item.id === occurrence.cardId)
          if (!card) { failure = 'O cartão vinculado à recorrência não existe mais.'; break }
          const generated = createRemainingCardInstallments({ ...occurrence, operationId: occurrenceOperationId, installmentNumber: 1, installmentTotal: 1 }, card)
            .map((item) => ({ ...item, ...accountAssignment({ ...item, cardId: card.id }) }))
          if (generated.some((item) => paidInvoiceIds.has(item.invoiceId))) {
            failure = 'A ocorrência cairia em uma fatura já paga. A fatura não foi reaberta automaticamente.'
            break
          }
          generated.forEach((item) => {
            plannedTransactions.push(item)
            if (!nextInvoicePayments.some((record) => record.id === item.invoiceId) && !plannedInvoicePayments.some((record) => record.id === item.invoiceId)) plannedInvoicePayments.push(createOfficialInvoiceRecord(item, card))
          })
          plannedTransactionOperationIds.push(occurrenceOperationId)
          continue
        }
        const account = occurrence.accountId ? accounts.find((item) => item.accountId === occurrence.accountId) : null
        if (occurrence.accountId && (!account || account.archived)) { failure = 'A conta vinculada à recorrência não existe ou está arquivada.'; break }
        plannedTransactions.push({ ...occurrence, cardId: null, invoiceId: null, ...accountAssignment(occurrence), id: uid(), operationId: occurrenceOperationId, createdAt: at, updatedAt: at })
        plannedTransactionOperationIds.push(occurrenceOperationId)
      }
      if (!failure) {
        for (const occurrence of plan.transferOccurrences) {
          const result = createTransferRecord(occurrence, { accounts, existingTransfers: [...nextTransfers, ...plannedTransfers], operationId: occurrence.operationId, createdAt: at, updatedAt: at })
          if (!result.success) { failure = result.errors?.join(' ') || 'Não foi possível criar a transferência recorrente agendada.'; break }
          plannedTransfers.push(result.transfer)
          getTransferOperationIds(result.transfer).forEach((id) => plannedTransferOperationIds.push(id))
        }
      }
      if (failure) {
        nextRecurrences[index] = appendRecurrenceAudit({ ...recurrence, generationError: failure, generationFailedAt: at }, 'recurrence_generation_failed', operationId, at, { reason: 'OCCURRENCE_WRITE_REJECTED' })
        failures.push({ recurrenceId: recurrence.recurrenceId, message: failure })
        changed = true
        return
      }
      nextTransactions = [...plannedTransactions, ...nextTransactions]
      nextTransfers = [...nextTransfers, ...plannedTransfers]
      nextInvoicePayments = [...nextInvoicePayments, ...plannedInvoicePayments]
      transactionOperationIds.push(...plannedTransactionOperationIds)
      transferOperationIds.push(...plannedTransferOperationIds)
      const advanced = advanceRecurrenceAfterGeneration(recurrence, plan, { updatedAt: at })
      const updatedRecurrence = advanced.success ? advanced.recurrence : recurrence
      nextRecurrences[index] = appendRecurrenceAudit({ ...updatedRecurrence, generationError: null, lastGeneratedAt: at, lastGenerationReport: { generated: plannedTransactions.length + plannedTransfers.length, skippedExisting: plan.skippedExisting.length, skippedPast: plan.skippedPast?.length || 0, skippedCancelled: plan.skippedCancelled?.length || 0, windowEndDate: plan.windowEndDate } }, 'recurrence_occurrences_generated', operationId, at, { generatedCount: plannedTransactions.length + plannedTransfers.length, skippedPastCount: plan.skippedPast?.length || 0, skippedCancelledCount: plan.skippedCancelled?.length || 0 })
      generatedCount += plannedTransactions.length + plannedTransfers.length
      changed = true
    })
    if (!changed) return { success: true, generatedCount: 0, generated: 0, persistencePending: false, failures: [] }
    stageRecurrenceMutation({ transactions: nextTransactions, transfers: nextTransfers, recurrences: nextRecurrences, invoicePayments: nextInvoicePayments, alertStates }, { transactionOperationIds, transferOperationIds, recurrenceOperationIds: [operationId] })
    return { success: true, generatedCount, generated: generatedCount, failures, persistencePending: true }
  }
  const createRecurrence = (input, options = {}) => {
    if (pendingTransferPersistenceRef.current) return pendingFinancialMutationResult()
    if (pendingRecurrencePersistenceRef.current) return { success: false, errorCode: 'RECURRENCE_PERSISTENCE_PENDING', errors: ['Aguarde a confirmação da alteração recorrente anterior.'] }
    const categoryError = invalidRecurrenceCategory(input)
    if (categoryError) return categoryError
    const operationId = options.operationId || uid()
    if (processedRecurrenceOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = createRecurrenceRecord(input, { ...options, accounts, cards, existingRecurrences: recurrences })
    if (!result.success) return result
    const created = appendRecurrenceAudit(result.recurrence, 'recurrence_created', operationId)
    stageRecurrenceMutation({ ...recurrenceState(), recurrences: [...recurrences, created] }, { recurrenceOperationIds: [operationId] })
    automaticRecurrenceGenerationRef.current = false
    return { ...result, recurrence: created, operationId, persistencePending: true }
  }
  const updateRecurrence = (recurrenceId, changes, options = {}) => {
    if (pendingTransferPersistenceRef.current) return pendingFinancialMutationResult()
    if (pendingRecurrencePersistenceRef.current) return { success: false, errorCode: 'RECURRENCE_PERSISTENCE_PENDING', errors: ['Aguarde a confirmação da alteração recorrente anterior.'] }
    const categoryError = invalidRecurrenceCategory(changes)
    if (categoryError) return categoryError
    const operationId = options.operationId || uid()
    if (processedRecurrenceOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const current = recurrences.find((item) => item.recurrenceId === recurrenceId)
    const result = updateRecurrenceRecord(current, changes, { accounts, cards, transactions, transfers, updatedAt: new Date().toISOString() })
    if (!result.success) return result
    const scope = ['future', 'all'].includes(options.scope) ? options.scope : 'rule'
    const effectiveFrom = scope === 'all'
      ? current.startDate
      : (isValidAccountDate(options.effectiveFrom) ? options.effectiveFrom : localFinancialDate())
    const appliesToFutureOccurrence = (record) => record?.recurrenceId === recurrenceId
      && record.generatedFromRecurrence
      && !record.detachedFromRecurrence
      && !['paid', 'received', 'completed'].includes(record.status)
      && scope !== 'rule'
      && String(record.scheduledOccurrenceDate || record.date || '') >= effectiveFrom
    const updateTimestamp = new Date().toISOString()
    const updated = appendRecurrenceAudit(result.recurrence, 'recurrence_updated', operationId, updateTimestamp, { scope, effectiveFrom: scope === 'rule' ? null : effectiveFrom })
    const nextTransactions = transactions.map((transaction) => !appliesToFutureOccurrence(transaction) ? transaction : {
      ...transaction,
      description: updated.description,
      amount: Number(updated.amount),
      category: updated.category,
      notes: updated.notes,
      paymentMethod: transaction.cardId ? 'Crédito' : updated.paymentMethod,
      accountId: transaction.cardId ? null : updated.accountId,
      accountAssignmentStatus: transaction.cardId ? 'not-applicable' : updated.accountId ? 'assigned' : 'unassigned',
      recurrenceVersion: updated.updatedAt,
      updatedAt: updateTimestamp,
      recurrenceOccurrenceAudit: [...(transaction.recurrenceOccurrenceAudit || []).slice(-49), { eventId: uid(), operationId, type: 'recurrence_series_update_applied', createdAt: updateTimestamp, scope }],
    })
    const nextTransfers = transfers.map((transfer) => !appliesToFutureOccurrence(transfer) ? transfer : {
      ...transfer,
      description: updated.description,
      amount: Number(updated.amount),
      notes: updated.notes,
      recurrenceVersion: updated.updatedAt,
      updatedAt: updateTimestamp,
      audit: [...(transfer.audit || []).slice(-49), { eventId: uid(), operationId, type: 'recurrence_series_update_applied', createdAt: updateTimestamp, scope }],
    })
    stageRecurrenceMutation({ ...recurrenceState(), transactions: nextTransactions, transfers: nextTransfers, recurrences: recurrences.map((item) => item.recurrenceId === recurrenceId ? updated : item) }, { recurrenceOperationIds: [operationId] })
    automaticRecurrenceGenerationRef.current = false
    return { ...result, recurrence: updated, operationId, persistencePending: true }
  }
  const moveRecurrenceCursorToToday = (recurrence) => {
    const today = localFinancialDate()
    let cursor = recurrence.nextOccurrenceDate || recurrence.startDate
    let steps = 0
    while (cursor && cursor < today && steps < 10000) {
      cursor = getNextOccurrenceDate(recurrence, cursor)
      steps += 1
    }
    return cursor || recurrence.nextOccurrenceDate
  }
  const changeRecurrenceStatus = (recurrenceId, change, type, options = {}) => {
    if (pendingTransferPersistenceRef.current) return pendingFinancialMutationResult()
    if (pendingRecurrencePersistenceRef.current) return { success: false, errorCode: 'RECURRENCE_PERSISTENCE_PENDING', errors: ['Aguarde a confirmação da alteração recorrente anterior.'] }
    const operationId = options.operationId || uid()
    if (processedRecurrenceOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const current = recurrences.find((item) => item.recurrenceId === recurrenceId)
    const result = change(current, { updatedAt: new Date().toISOString() })
    if (!result.success) return result
    const resumed = type === 'recurrence_resumed' ? { ...result.recurrence, nextOccurrenceDate: moveRecurrenceCursorToToday(result.recurrence) } : result.recurrence
    const cancellationDate = localFinancialDate()
    const cancelledFutureTransactions = type === 'recurrence_cancelled'
      ? transactions.filter((item) => item.recurrenceId === recurrenceId && item.generatedFromRecurrence && !item.detachedFromRecurrence && !['paid', 'received'].includes(item.status) && String(item.scheduledOccurrenceDate || item.date || '') >= cancellationDate)
      : []
    const cancelledKeys = cancelledFutureTransactions.map((item) => item.recurrenceOccurrenceId || getRecurrenceOccurrenceKey(item.recurrenceId, item.scheduledOccurrenceDate || item.date, item.recurrenceType || item.type)).filter(Boolean)
    const cancellationAware = type === 'recurrence_cancelled' ? { ...resumed, cancelledOccurrenceKeys: [...new Set([...(resumed.cancelledOccurrenceKeys || []), ...cancelledKeys])] } : resumed
    const updated = appendRecurrenceAudit(cancellationAware, type, operationId, undefined, { cancelledFutureOccurrences: cancelledKeys.length })
    const next = recurrenceState()
    if (cancelledFutureTransactions.length) next.transactions = transactions.filter((item) => !cancelledFutureTransactions.some((cancelled) => cancelled.id === item.id))
    if (type === 'recurrence_cancelled') {
      const at = new Date().toISOString()
      next.transfers = transfers.map((transfer) => transfer.recurrenceId === recurrenceId && transfer.generatedFromRecurrence && !transfer.detachedFromRecurrence && transfer.status === 'scheduled' && String(transfer.scheduledOccurrenceDate || transfer.date || '') >= cancellationDate
        ? { ...transfer, status: 'cancelled', updatedAt: at, audit: [...(transfer.audit || []).slice(-49), { eventId: uid(), operationId, type: 'recurrence_cancelled', createdAt: at }] }
        : transfer)
    }
    next.recurrences = recurrences.map((item) => item.recurrenceId === recurrenceId ? updated : item)
    stageRecurrenceMutation(next, { recurrenceOperationIds: [operationId] })
    if (type === 'recurrence_resumed') automaticRecurrenceGenerationRef.current = false
    return { ...result, recurrence: updated, operationId, persistencePending: true }
  }
  const pauseRecurrence = (recurrenceId, options = {}) => changeRecurrenceStatus(recurrenceId, pauseRecurrenceRecord, 'recurrence_paused', options)
  const resumeRecurrence = (recurrenceId, options = {}) => changeRecurrenceStatus(recurrenceId, resumeRecurrenceRecord, 'recurrence_resumed', options)
  const completeRecurrence = (recurrenceId, options = {}) => changeRecurrenceStatus(recurrenceId, completeRecurrenceRecord, 'recurrence_completed', options)
  const cancelRecurrence = (recurrenceId, options = {}) => changeRecurrenceStatus(recurrenceId, cancelRecurrenceRecord, 'recurrence_cancelled', options)
  const deleteRecurrence = (recurrenceId, options = {}) => {
    if (pendingTransferPersistenceRef.current) return pendingFinancialMutationResult()
    if (pendingRecurrencePersistenceRef.current) return { success: false, errorCode: 'RECURRENCE_PERSISTENCE_PENDING', errors: ['Aguarde a confirmação da alteração recorrente anterior.'] }
    const operationId = options.operationId || uid()
    if (processedRecurrenceOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const result = deleteRecurrenceRecord(recurrences, recurrenceId, { transactions, transfers })
    if (!result.success) return result
    stageRecurrenceMutation({ ...recurrenceState(), recurrences: result.recurrences }, { recurrenceOperationIds: [operationId] })
    return { ...result, operationId, persistencePending: true }
  }
  const updateRecurrenceOccurrence = (occurrenceId, changes = {}, options = {}) => {
    if (pendingTransferPersistenceRef.current) return pendingFinancialMutationResult()
    if (pendingRecurrencePersistenceRef.current) return { success: false, errorCode: 'RECURRENCE_PERSISTENCE_PENDING', errors: ['Aguarde a confirmação da alteração recorrente anterior.'] }
    const operationId = options.operationId || uid()
    if (processedRecurrenceOperationsRef.current.has(operationId)) return { success: false, duplicateOperation: true, errorCode: 'DUPLICATE_OPERATION' }
    const isTransfer = options.occurrenceType === 'transfer'
    const collection = isTransfer ? transfers : transactions
    const key = isTransfer ? 'transferId' : 'id'
    const current = collection.find((item) => item[key] === occurrenceId)
    const detached = detachRecurrenceOccurrence(current, { updatedAt: new Date().toISOString() })
    if (!detached.success) return detached
    const protectedChanges = { ...changes }
    ;['recurrenceId', 'recurrenceType', 'recurrenceOccurrenceId', 'scheduledOccurrenceDate', 'generatedFromRecurrence', 'recurrenceVersion'].forEach((field) => delete protectedChanges[field])
    const updated = { ...detached.occurrence, ...protectedChanges, amount: protectedChanges.amount === undefined ? detached.occurrence.amount : Number(protectedChanges.amount), detachedFromRecurrence: true, recurrenceOccurrenceAudit: [...(detached.occurrence.recurrenceOccurrenceAudit || []).slice(-49), { eventId: uid(), operationId, type: 'recurrence_occurrence_detached', createdAt: new Date().toISOString() }] }
    if (!Number.isFinite(Number(updated.amount)) || Number(updated.amount) <= 0) return { success: false, errorCode: 'INVALID_RECURRENCE_OCCURRENCE', errors: ['O valor da ocorrência precisa ser maior que zero.'] }
    if (!isTransfer && updated.accountId) {
      const account = accounts.find((item) => item.accountId === updated.accountId)
      if (!account || account.archived) return { success: false, errorCode: 'INVALID_ACCOUNT_REFERENCE', errors: ['A conta selecionada precisa existir e estar ativa.'] }
    }
    const next = recurrenceState()
    if (isTransfer) next.transfers = transfers.map((item) => item.transferId === occurrenceId ? updated : item)
    else next.transactions = transactions.map((item) => item.id === occurrenceId ? { ...updated, ...accountAssignment(updated) } : item)
    stageRecurrenceMutation(next, { recurrenceOperationIds: [operationId] })
    return { success: true, occurrence: updated, operationId, persistencePending: true }
  }
  const markAlertRead = (alertKey) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    setAlertStates(markAlertReadState(alertStates, alertKey))
    return { success: true }
  }
  const dismissAlert = (alertKey) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    setAlertStates(dismissAlertState(alertStates, alertKey))
    return { success: true }
  }
  const snoozeAlert = (alertKey, snoozedUntil) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const result = snoozeAlertState(alertStates, alertKey, snoozedUntil)
    if (!result.success) return result
    setAlertStates(result.alertStates)
    return { success: true }
  }
  const payInvoice = (invoiceId, payment = {}) => {
    if (hasPendingFinancialMutation()) return pendingFinancialMutationResult()
    const invoice = invoices.find((item) => item.id === invoiceId)
    if (!invoice || invoice.totalPending <= 0) return { success: false, errorCode: 'INVOICE_NOT_PAYABLE' }
    const accountId = payment.accountId || null
    if (accountId === 'unassigned' || accountId === '__unassigned__') return { success: false, errorCode: 'INVALID_PAYER_ACCOUNT', message: 'Use uma conta real ou deixe a conta pagadora sem defini\u00e7\u00e3o.' }
    const account = accountId ? accounts.find((item) => item.accountId === accountId) : null
    if (accountId && (!account || account.archived)) return { success: false, errorCode: 'INVALID_PAYER_ACCOUNT', message: 'A conta pagadora precisa existir e estar ativa.' }
    const paymentDate = payment.paymentDate || localFinancialDate()
    if (!isValidAccountDate(paymentDate)) return { success: false, errorCode: 'INVALID_PAYMENT_DATE', message: 'Informe uma data de pagamento v\u00e1lida.' }
    const paidAt = payment.paidAt && !Number.isNaN(Date.parse(payment.paidAt)) ? payment.paidAt : new Date().toISOString()
    const operationId = payment.operationId || uid()
    const existingRecord = invoicePayments.find((item) => item.id === invoiceId)
    if (processedInvoicePaymentOperationsRef.current.has(operationId) || existingRecord?.paymentHistory?.some((item) => item.operationId === operationId)) return { success: false, duplicateOperation: true }
    if (existingRecord?.status === 'paid' && !existingRecord.reopenedAt) return { success: false, errorCode: 'INVOICE_ALREADY_PAID' }
    processedInvoicePaymentOperationsRef.current.add(operationId)
    setInvoicePayments((current) => {
      const existing = current.find((item) => item.id === invoiceId) || {}
      if ((existing.status === 'paid' && !existing.reopenedAt) || existing.paymentHistory?.some((item) => item.operationId === operationId)) return current
      return [...current.filter((item) => item.id !== invoiceId), appendInvoicePayment(existing, invoice, paidAt, { accountId, paymentDate, notes: payment.notes, operationId })]
    })
    setTransactions((current) => current.map((item) => item.invoiceId === invoiceId && item.status !== 'paid' ? { ...item, status: 'paid', invoiceStatus: 'paid', paidAt } : item))
    return { success: true, operationId }
  }
  const getInvoiceTransactions = useCallback((invoiceId) => getInvoiceTransactionsFromIndex(indexes, invoiceId), [indexes])
  const updateInvoiceDates = (invoiceId, changes) => setInvoicePayments((current) => { const existing = current.find((item) => item.id === invoiceId) || {}; const invoice = invoices.find((item) => item.id === invoiceId); const card = cards.find((item) => item.id === invoice?.cardId); const defaults = invoice && card ? getInvoiceDates(card, invoice.invoiceYear, invoice.invoiceMonth) : {}; const customClosingDate = changes.customClosingDate !== undefined ? changes.customClosingDate : existing.customClosingDate; const customDueDate = changes.customDueDate !== undefined ? changes.customDueDate : existing.customDueDate; const updated = { ...existing, id: invoiceId, invoiceId, cardId: invoice?.cardId, invoiceMonth: invoice?.invoiceMonth, invoiceYear: invoice?.invoiceYear, ...changes, closingDate: customClosingDate || defaults.closingDate || existing.closingDate, dueDate: customDueDate || defaults.dueDate || existing.dueDate, dateSource: customClosingDate || customDueDate ? 'custom' : 'card-default', updatedAt: new Date().toISOString(), createdAt: existing.createdAt || new Date().toISOString() }; return [...current.filter((item) => item.id !== invoiceId), updated] })
  const updateCard = (id, changes) => setCards((current) => current.map((card) => card.id === id ? { ...card, ...changes, closingDay: Number(changes.closingDay), dueDay: Number(changes.dueDay) } : card))
  const addBillingConfiguration = (id, changes) => { const target = cards.find((card) => card.id === id); if (!target) throw new Error('Cartão não encontrado.'); const updated = addCardBillingConfiguration(target, changes); setCards((current) => current.map((card) => card.id === id ? updated : card)); return updated }
  const addCategory = (name) => setCategories((current) => current.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase()) ? current : [...current, name])
  const removeCategory = (name) => {
    if (transactions.some((item) => item.category === name) || recurrences.some((item) => item.category === name)) return { success: false, errorCode: 'CATEGORY_IN_USE' }
    setCategories((current) => current.filter((item) => item !== name))
    return { success: true }
  }
  const archiveOrphanInvoice = (id, reason) => setInvoicePayments((current) => current.map((record) => record.id === id ? archiveInvoice(record, reason) : record))
  const restoreArchivedInvoice = (id) => setInvoicePayments((current) => current.map((record) => record.id === id ? restoreInvoice(record) : record))
  const permanentlyDeleteArchivedInvoice = (id) => setInvoicePayments((current) => current.filter((record) => record.id !== id || !record.archived))
  const runInstallmentIdentityMigration = () => {
    if (Number(migrationMetadata.installmentIdentityVersion || 0) >= INSTALLMENT_IDENTITY_MIGRATION_VERSION) return { alreadyExecuted: true, groupsUpdated: 0, unchanged: transactions.length }
    const result = migrateSafeInstallmentIdentities(transactions)
    setTransactions(result.transactions); setMigrationMetadata((current) => ({ ...current, installmentIdentityVersion: INSTALLMENT_IDENTITY_MIGRATION_VERSION, installmentIdentityMigratedAt: new Date().toISOString(), installmentIdentityReport: { groupsUpdated: result.report.groupsUpdated, unchanged: result.report.unchanged } }))
    return result.report
  }
  const runInstallmentValueMigration = () => {
    if (Number(migrationMetadata.installmentValueVersion || 0) >= INSTALLMENT_VALUE_MIGRATION_VERSION) return { alreadyExecuted: true, changed: [] }
    const result = migrateSafeInstallmentValues(transactions); setTransactions(result.transactions); setMigrationMetadata((current) => ({ ...current, installmentValueVersion: INSTALLMENT_VALUE_MIGRATION_VERSION, installmentValueMigratedAt: new Date().toISOString(), installmentValueReport: result.report })); return result.report
  }
  const runInvoiceDateMigration = () => { if (Number(migrationMetadata.invoiceDateVersion || 0) >= INVOICE_DATE_MIGRATION_VERSION) return { alreadyExecuted: true, created: [] }; const result = migrateSafeInvoiceDates(transactions, invoicePayments, cards); setInvoicePayments(result.records); setMigrationMetadata((current) => ({ ...current, invoiceDateVersion: INVOICE_DATE_MIGRATION_VERSION, invoiceDateMigratedAt: new Date().toISOString(), invoiceDateReport: result.report })); return result.report }
  const runCardBillingMigration = () => { if (Number(migrationMetadata.cardBillingVersion || 0) >= CARD_BILLING_MIGRATION_VERSION) return { alreadyExecuted: true, migrated: [] }; const result = migrateLegacyCardConfigurations(cards); setCards(result.cards); setMigrationMetadata((current) => ({ ...current, cardBillingVersion: CARD_BILLING_MIGRATION_VERSION, cardBillingMigratedAt: new Date().toISOString(), cardBillingReport: result.report })); return result.report }
  const resolveConfirmedDuplicate = (removeId, keepId) => { setTransactions((current) => removeConfirmedDuplicate(current, removeId, keepId)); setMigrationMetadata((current) => ({ ...current, audit: [...(current.audit || []).slice(-49), { eventId: uid(), type: 'duplicate_resolved', createdAt: new Date().toISOString(), affectedIds: [removeId, keepId] }] })) }
  const runAccountMigration = () => {
    if (Number(migrationMetadata.accountMigrationVersion || 0) >= ACCOUNT_MIGRATION_VERSION) return { alreadyExecuted: true, accountsIntroduced: 0, transactionsChanged: 0 }
    const result = migrateAccountsState({ accounts, transactions }); setAccounts(result.state.accounts); setMigrationMetadata((current) => ({ ...current, accountMigrationVersion: ACCOUNT_MIGRATION_VERSION, accountMigratedAt: new Date().toISOString(), accountMigrationReport: result.report })); return result.report
  }
  const runTransferMigration = () => {
    if (Number(migrationMetadata.transferMigrationVersion || 0) >= TRANSFER_MIGRATION_VERSION) return { alreadyExecuted: true, transfersIntroduced: 0, transfersChanged: 0 }
    const result = migrateTransfersState({ transfers }); setTransfers(result.state.transfers); setMigrationMetadata((current) => ({ ...current, transferMigrationVersion: TRANSFER_MIGRATION_VERSION, transferMigratedAt: new Date().toISOString(), transferMigrationReport: result.report })); return result.report
  }
  const runRecurrenceMigration = () => {
    if (Number(migrationMetadata.recurrenceMigrationVersion || 0) >= RECURRENCE_MIGRATION_VERSION) return { alreadyExecuted: true, recurrencesIntroduced: 0, alertStatesIntroduced: 0 }
    const result = migrateRecurrencesState({ recurrences, alertStates })
    setRecurrences(result.state.recurrences)
    setAlertStates(result.state.alertStates)
    setMigrationMetadata((current) => ({ ...current, recurrenceMigrationVersion: RECURRENCE_MIGRATION_VERSION, recurrenceMigratedAt: new Date().toISOString(), recurrenceMigrationReport: result.report }))
    return result.report
  }

  useEffect(() => {
    if (automaticRecurrenceGenerationRef.current || pendingRecurrencePersistenceRef.current || persistence.status !== 'synced' || persistence.pendingChanges) return
    if (Number(migrationMetadata.recurrenceMigrationVersion || 0) < RECURRENCE_MIGRATION_VERSION) return
    if (!recurrences.some((recurrence) => recurrence.status === 'active' && recurrence.generationMode === 'automatic')) return
    automaticRecurrenceGenerationRef.current = true
    generateRecurrenceOccurrences({ automaticOnly: true })
  }, [migrationMetadata.recurrenceMigrationVersion, persistence.pendingChanges, persistence.status, recurrences])

  const filteredTransactions = useMemo(() => filterTransactions(transactions, filters, { cards, invoices, indexes, recurrences }), [transactions, filters, cards, invoices, indexes, recurrences])
  const filteredTransfers = useMemo(() => filterTransfers(transfers, filters, { accounts, recurrences }), [transfers, filters, accounts, recurrences])

  const value = useMemo(() => ({
    transactions, filteredTransactions, transfers, filteredTransfers, recurrences, alertStates, alerts,
    categories, cards, accounts, invoices, invoicePayments, indexes, recurrenceIndexes, costCenters: storedCostCenters, userSettings, setUserSettings, filters, setFilters, defaultFilters,
    addTransaction, updateTransaction, deleteTransaction, bulkUpdateTransactions, bulkDeleteTransactions, togglePaid,
    addAccount, updateAccount, archiveAccount, restoreAccount, deleteAccount,
    addTransfer, updateScheduledTransfer, completeTransfer, cancelTransfer, reverseTransfer,
    createRecurrence, updateRecurrence, pauseRecurrence, resumeRecurrence, completeRecurrence, cancelRecurrence, deleteRecurrence, generateRecurrenceOccurrences, updateRecurrenceOccurrence,
    markAlertRead, dismissAlert, snoozeAlert,
    payInvoice, getInvoiceTransactions, updateCard, addBillingConfiguration, updateInvoiceDates, addCategory, removeCategory,
    archiveOrphanInvoice, restoreArchivedInvoice, permanentlyDeleteArchivedInvoice,
    installmentIdentityMigration: Number(migrationMetadata.installmentIdentityVersion || 0), runInstallmentIdentityMigration,
    installmentValueMigration: Number(migrationMetadata.installmentValueVersion || 0), runInstallmentValueMigration,
    invoiceDateMigration: Number(migrationMetadata.invoiceDateVersion || 0), runInvoiceDateMigration,
    cardBillingMigration: Number(migrationMetadata.cardBillingVersion || 0), runCardBillingMigration,
    accountMigration: Number(migrationMetadata.accountMigrationVersion || 0), runAccountMigration,
    transferMigration: Number(migrationMetadata.transferMigrationVersion || 0), runTransferMigration,
    recurrenceMigration: Number(migrationMetadata.recurrenceMigrationVersion || 0), runRecurrenceMigration,
    resolveConfirmedDuplicate, persistence, retryPersistence, startEmptyAfterConfirmation,
    financeState, replaceFinanceState, hasLocalState,
  }), [transactions, filteredTransactions, transfers, filteredTransfers, recurrences, alertStates, alerts, categories, cards, accounts, invoices, invoicePayments, indexes, recurrenceIndexes, storedCostCenters, userSettings, filters, migrationMetadata, persistence, retryPersistence, startEmptyAfterConfirmation, financeState, replaceFinanceState, hasLocalState])
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export const useFinance = () => {
  const context = useContext(FinanceContext)
  if (!context) throw new Error('useFinance deve ser usado dentro de FinanceProvider')
  return context
}
