import { CURRENT_FINANCE_DATA_VERSION } from './dataValidation.js'
import { readFinanceStorage } from './backup.js'
import { inspectPersistence } from './snapshot.js'
import { analyzeDuplicates } from './deduplication.js'
import { analyzeInstallmentIdentity } from './identity.js'
import { isOrphanInvoice } from './orphanInvoices.js'
import { analyzeInstallmentValues } from './installmentValueCalculations.js'
import { analyzeInvoiceDateRecords } from './invoiceDates.js'
import { validateBillingConfigurations } from './cardBillingConfig.js'
import { buildInvoices, getInvoicePeriod } from './invoiceCalculations.js'
import { ACCOUNT_TYPES, isValidAccountDate } from '../domain/accounts/accountService.js'
import { getTransferOperationIds, TRANSFER_STATUSES, validateTransferRecord } from '../domain/transfers/transferService.js'
import { getOccurrenceKeyFromRecord, getOccurrenceOrdinal, validateRecurrenceRecord } from '../domain/recurrences/recurrenceService.js'
import { deriveFinanceAlerts } from '../domain/alerts/alertSelectors.js'

const validDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const issue = (id, severity, description, count, suggestion, examples = []) => ({ id, severity, description, count, suggestion, examples: examples.slice(0, 5) })
const duplicates = (items, keyFactory) => {
  const counts = new Map()
  items.forEach((item) => { const key = keyFactory(item); if (key) counts.set(key, (counts.get(key) || 0) + 1) })
  return [...counts.entries()].filter(([, count]) => count > 1)
}

export const analyzeFinanceData = ({ transactions = [], cards = [], accounts = [], transfers = [], recurrences = [], alertStates = [], categories = [], invoiceRecords = [], financeVersion = 0, storageErrors = [], missingKeys = [] }) => {
  const issues = []
  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const safeCards = Array.isArray(cards) ? cards : []
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const safeTransfers = Array.isArray(transfers) ? transfers : []
  const safeRecurrences = Array.isArray(recurrences) ? recurrences : []
  const safeAlertStates = Array.isArray(alertStates) ? alertStates : []
  const safeCategories = Array.isArray(categories) ? categories : []
  const safeInvoices = Array.isArray(invoiceRecords) ? invoiceRecords : []
  if (!Array.isArray(transactions) || !Array.isArray(cards) || !Array.isArray(invoiceRecords) || !Array.isArray(transfers)) issues.push(issue('invalid-storage-types', 'critical', 'Uma ou mais coleções principais não são listas válidas.', 1, 'Restaure um backup válido antes de continuar.'))
  if (storageErrors.length) issues.push(issue('storage-corruption', 'critical', 'Existem chaves do LocalStorage com JSON corrompido.', storageErrors.length, 'Exporte o que for possível e restaure um backup validado.', storageErrors))
  if (missingKeys.length) issues.push(issue('incomplete-storage', 'high', 'O LocalStorage financeiro está incompleto.', missingKeys.length, 'Confirme se a aplicação já foi inicializada e mantenha um backup externo.', missingKeys))
  if (!Number.isInteger(Number(financeVersion)) || Number(financeVersion) < 0 || Number(financeVersion) > CURRENT_FINANCE_DATA_VERSION) issues.push(issue('incompatible-version', 'critical', 'A versão dos dados é inválida ou mais nova que a aplicação.', 1, 'Não execute migrações; use uma versão compatível da aplicação.', [financeVersion]))

  const duplicateIds = duplicates(safeTransactions, (item) => item?.id)
  if (duplicateIds.length) issues.push(issue('duplicate-ids', 'critical', 'Existem lançamentos com o mesmo ID.', duplicateIds.reduce((sum, [, count]) => sum + count - 1, 0), 'Não exclua automaticamente; compare os registros e preserve a operação correta.', duplicateIds.map(([id]) => id)))
  const duplicateInstallments = duplicates(safeTransactions.filter((item) => item?.installmentGroupId), (item) => `${item.installmentGroupId}:${item.installmentNumber}`)
  if (duplicateInstallments.length) issues.push(issue('duplicate-installments', 'critical', 'Existem parcelas repetidas no mesmo grupo e número.', duplicateInstallments.length, 'Compare competência, valor e origem antes de remover qualquer parcela.', duplicateInstallments.map(([key]) => key)))
  const duplicateReport = analyzeDuplicates(safeTransactions)
  const repeatedOperations = duplicateReport.confirmed.filter((group) => group.reason === 'same-operation-id')
  if (repeatedOperations.length) issues.push(issue('duplicate-operations', 'critical', 'Existem operações técnicas processadas mais de uma vez.', repeatedOperations.length, 'Revise cada conflito e escolha explicitamente qual registro manter.', repeatedOperations.map((group) => group.key)))
  if (duplicateReport.probable.length) issues.push(issue('probable-duplicates', 'medium', 'Existem lançamentos semelhantes sem identidade repetida.', duplicateReport.probable.length, 'Analise manualmente; compras legítimas iguais não devem ser removidas.', duplicateReport.probable.map((group) => group.key)))
  const identityReport = analyzeInstallmentIdentity(safeTransactions)
  if (identityReport.ambiguous.length) issues.push(issue('ambiguous-installment-identity', 'medium', 'Existem parcelas sem evidência suficiente para formar grupos.', identityReport.ambiguous.length, 'Revise manualmente; a migração segura não altera esses casos.', identityReport.ambiguous.map((item) => item.id)))
  const valueReport = analyzeInstallmentValues(safeTransactions)
  if (valueReport.divergent.length) issues.push(issue('divergent-installment-fields', 'high', 'Existem parcelas em que amount e installmentAmount divergem.', valueReport.divergent.length, 'Revise manualmente a origem do valor; não normalize casos ambíguos.', valueReport.divergent.map((item) => item.id)))
  if (valueReport.missingMode.length) issues.push(issue('missing-value-input-mode', 'low', 'Existem parcelas sem modo explícito de entrada do valor.', valueReport.missingMode.length, 'Considere-as como valor por parcela até revisão explícita.', valueReport.missingMode.map((item) => item.id)))
  const temporalMismatch = safeTransactions.filter((item) => { if (item.invoiceAssignmentMode !== 'automatic' || !item.cardId || !item.date) return false; const card = safeCards.find((value) => value.id === item.cardId); if (!card) return false; try { const period = getInvoicePeriod(item.date, card); return period.invoiceMonth !== Number(item.invoiceMonth) || period.invoiceYear !== Number(item.invoiceYear) } catch { return true } })
  if (temporalMismatch.length) issues.push(issue('automatic-temporal-mismatch', 'high', 'Há atribuições automáticas incompatíveis com a data da compra.', temporalMismatch.length, 'Revise a competência e escolha explicitamente recalcular ou manter.', temporalMismatch.map((item) => item.id)))

  const installmentsWithoutGroup = safeTransactions.filter((item) => Number(item?.installmentTotal) > 1 && !item.installmentGroupId)
  if (installmentsWithoutGroup.length) issues.push(issue('installments-without-group', 'high', 'Há parcelas sem identificador de grupo.', installmentsWithoutGroup.length, 'Associe grupos somente após confirmar quais parcelas pertencem à mesma compra.', installmentsWithoutGroup.map((item) => item.id)))
  const groups = new Map()
  safeTransactions.filter((item) => item?.installmentGroupId).forEach((item) => { if (!groups.has(item.installmentGroupId)) groups.set(item.installmentGroupId, []); groups.get(item.installmentGroupId).push(item) })
  const missingInstallments = []
  groups.forEach((items, groupId) => {
    const numbers = new Set(items.map((item) => Number(item.installmentNumber)).filter(Number.isInteger))
    const first = Math.min(...numbers)
    const total = Math.max(...items.map((item) => Number(item.installmentTotal) || 0))
    for (let number = first; number <= total; number += 1) if (!numbers.has(number)) missingInstallments.push(`${groupId}:${number}/${total}`)
  })
  if (missingInstallments.length) issues.push(issue('missing-installments', 'high', 'Há intervalos faltantes em parcelamentos.', missingInstallments.length, 'Verifique se as parcelas foram excluídas ou se a projeção ficou incompleta.', missingInstallments))

  const invalidInstallmentNumber = safeTransactions.filter((item) => item.installmentNumber !== undefined && (!Number.isInteger(Number(item.installmentNumber)) || Number(item.installmentNumber) < 1))
  if (invalidInstallmentNumber.length) issues.push(issue('invalid-installment-number', 'high', 'Existem números de parcela inválidos.', invalidInstallmentNumber.length, 'Revise os campos installmentNumber.', invalidInstallmentNumber.map((item) => item.id)))
  const invalidInstallmentTotal = safeTransactions.filter((item) => item.installmentTotal !== undefined && (!Number.isInteger(Number(item.installmentTotal)) || Number(item.installmentTotal) < 1 || Number(item.installmentNumber || 1) > Number(item.installmentTotal)))
  if (invalidInstallmentTotal.length) issues.push(issue('invalid-installment-total', 'high', 'Existem totais de parcelas inválidos.', invalidInstallmentTotal.length, 'Revise os campos installmentTotal e installmentNumber.', invalidInstallmentTotal.map((item) => item.id)))
  const inconsistentAmounts = safeTransactions.filter((item) => item.installmentAmount !== undefined && Number.isFinite(Number(item.amount)) && Number.isFinite(Number(item.installmentAmount)) && Math.abs(Number(item.amount) - Number(item.installmentAmount)) > 0.001)
  if (inconsistentAmounts.length) issues.push(issue('inconsistent-installment-values', 'high', 'Há parcelas em que amount difere de installmentAmount.', inconsistentAmounts.length, 'Confirme qual valor representa a parcela antes de sincronizar.', inconsistentAmounts.map((item) => item.id)))
  const invalidAmounts = safeTransactions.filter((item) => !Number.isFinite(Number(item?.amount)) || Number(item.amount) < 0)
  if (invalidAmounts.length) issues.push(issue('invalid-values', 'critical', 'Existem lançamentos com valores inválidos.', invalidAmounts.length, 'Revise os valores usando um backup como referência.', invalidAmounts.map((item) => item.id)))

  const invalidDates = safeTransactions.filter((item) => (item.date && !validDate(item.date)) || (item.dueDate && !validDate(item.dueDate)))
  if (invalidDates.length) issues.push(issue('invalid-dates', 'high', 'Existem datas de compra ou vencimento inválidas.', invalidDates.length, 'Corrija somente após confirmar a data original.', invalidDates.map((item) => item.id)))
  const cardIds = new Set(safeCards.map((card) => card?.id))
  const missingCards = safeTransactions.filter((item) => item?.cardId && !cardIds.has(item.cardId))
  if (missingCards.length) issues.push(issue('unknown-cards', 'critical', 'Existem compras ligadas a cartões inexistentes.', missingCards.length, 'Restaure o cartão correspondente ou reatribua após confirmação.', missingCards.map((item) => item.id)))
  const purchasesWithoutInvoice = safeTransactions.filter((item) => item?.cardId && !item.invoiceId)
  if (purchasesWithoutInvoice.length) issues.push(issue('card-purchases-without-invoice', 'critical', 'Existem compras de cartão sem fatura.', purchasesWithoutInvoice.length, 'Associe uma competência somente após validar data e fechamento.', purchasesWithoutInvoice.map((item) => item.id)))
  const transactionInvoiceIds = new Set(safeTransactions.map((item) => item?.invoiceId).filter(Boolean))
  const orphanInvoices = safeInvoices.filter((record) => record?.id && isOrphanInvoice(record, safeTransactions, safeCards).orphan)
  if (orphanInvoices.length) issues.push(issue('orphan-invoices', 'high', 'Existem registros de fatura sem compras.', orphanInvoices.length, 'Arquive ou remova somente depois de confirmar que não há histórico necessário.', orphanInvoices.map((item) => item.id)))
  const dateReport = analyzeInvoiceDateRecords(safeTransactions, safeInvoices)
  if (dateReport.ambiguous.length) issues.push(issue('ambiguous-invoice-dates', 'high', 'Há faturas com cópias históricas divergentes de vencimento.', dateReport.ambiguous.length, 'Escolha a data oficial manualmente; a migração não decide por frequência.', dateReport.ambiguous.map((item) => item.invoiceId)))
  const incompleteDateRecords = safeInvoices.filter((record) => !record.archived && (!record.closingDate || !record.dueDate || !record.dateSource))
  if (incompleteDateRecords.length) issues.push(issue('incomplete-official-invoice-dates', 'medium', 'Existem registros de fatura sem datas oficiais completas.', incompleteDateRecords.length, 'Consolide apenas registros seguros ou revise individualmente.', incompleteDateRecords.map((item) => item.id)))
  const configuredCards = safeCards.filter((card) => card.billingConfigurations)
  const invalidCardTimelines = configuredCards.filter((card) => !validateBillingConfigurations(card.billingConfigurations).valid)
  if (invalidCardTimelines.length) issues.push(issue('invalid-card-billing-timeline', 'critical', 'Existem linhas do tempo de cartão inválidas ou sobrepostas.', invalidCardTimelines.length, 'Não crie novas vigências até corrigir manualmente a linha do tempo.', invalidCardTimelines.map((card) => card.id)))
  if (configuredCards.length && configuredCards.length !== safeCards.length) issues.push(issue('legacy-card-without-billing-config', 'medium', 'Alguns cartões ainda não possuem configuração versionada.', safeCards.length - configuredCards.length, 'Execute a migração segura de configurações legadas.', safeCards.filter((card) => !card.billingConfigurations).map((card) => card.id)))

  const invalidCompetence = safeTransactions.filter((item) => item?.cardId && (!Number.isInteger(Number(item.invoiceMonth)) || Number(item.invoiceMonth) < 1 || Number(item.invoiceMonth) > 12 || !Number.isInteger(Number(item.invoiceYear)) || Number(item.invoiceYear) < 1900))
  if (invalidCompetence.length) issues.push(issue('invalid-competence', 'critical', 'Existem competências de fatura inválidas.', invalidCompetence.length, 'Revise invoiceMonth e invoiceYear sem usar automaticamente a data da compra.', invalidCompetence.map((item) => item.id)))
  const incompatibleInvoiceIds = safeTransactions.filter((item) => item?.invoiceId && item.cardId && item.invoiceMonth && item.invoiceYear && item.invoiceId !== `${item.cardId}-${item.invoiceYear}-${String(item.invoiceMonth).padStart(2, '0')}`)
  if (incompatibleInvoiceIds.length) issues.push(issue('incompatible-invoice-id', 'high', 'Existem invoiceId incompatíveis com cartão, mês ou ano.', incompatibleInvoiceIds.length, 'Compare a competência preservada antes de reconstruir o identificador.', incompatibleInvoiceIds.map((item) => item.id)))
  const paidInvoicesWithPending = safeInvoices.filter((record) => record?.status === 'paid' && safeTransactions.some((item) => item.invoiceId === record.id && item.status !== 'paid'))
  if (paidInvoicesWithPending.length) issues.push(issue('paid-invoices-with-pending-items', 'critical', 'Há faturas marcadas como pagas com compras pendentes.', paidInvoicesWithPending.length, 'Não pague nem reabra automaticamente; revise o histórico da fatura.', paidInvoicesWithPending.map((item) => item.id)))

  const duplicateAccountIds = duplicates(safeAccounts, (account) => account?.accountId)
  if (duplicateAccountIds.length) issues.push(issue('duplicate-account-ids', 'critical', 'Existem contas com o mesmo accountId.', duplicateAccountIds.reduce((sum, [, count]) => sum + count - 1, 0), 'N\u00e3o exclua automaticamente; preserve a conta correta e reatribua somente ap\u00f3s confirma\u00e7\u00e3o.', duplicateAccountIds.map(([accountId]) => accountId)))
  const invalidAccounts = safeAccounts.filter((account) => !account || typeof account.accountId !== 'string' || !account.accountId || !String(account.name || '').trim() || !ACCOUNT_TYPES.includes(account.type) || account.currency !== 'BRL' || !Number.isFinite(Number(account.initialBalance)) || account.initialBalance === '' || !isValidAccountDate(account.initialBalanceDate) || (account.archived !== undefined && typeof account.archived !== 'boolean'))
  if (invalidAccounts.length) issues.push(issue('invalid-account-records', 'critical', 'Existem contas com campos obrigat\u00f3rios inv\u00e1lidos.', invalidAccounts.length, 'Restaure ou revise as contas manualmente sem alterar os lan\u00e7amentos associados.', invalidAccounts.map((account) => account?.accountId || account?.name || 'conta sem identifica\u00e7\u00e3o')))
  const persistedVirtualAccounts = safeAccounts.filter((account) => ['unassigned', '__unassigned__'].includes(account?.accountId))
  if (persistedVirtualAccounts.length) issues.push(issue('persisted-virtual-account', 'high', 'A conta virtual "Sem conta definida" foi persistida como conta real.', persistedVirtualAccounts.length, 'Remova apenas a conta virtual persistida; mantenha os lan\u00e7amentos sem accountId como legados.', persistedVirtualAccounts.map((account) => account.accountId)))
  const accountIds = new Set(safeAccounts.map((account) => account?.accountId).filter(Boolean))
  const virtualReference = (accountId) => ['unassigned', '__unassigned__'].includes(accountId)
  const invalidAccountReferenceType = safeTransactions.filter((item) => item?.accountId !== undefined && item?.accountId !== null && typeof item.accountId !== 'string')
  if (invalidAccountReferenceType.length) issues.push(issue('invalid-account-reference-type', 'high', 'Existem lan\u00e7amentos com accountId em formato inv\u00e1lido.', invalidAccountReferenceType.length, 'Revise a refer\u00eancia sem inferir uma conta a partir do campo textual legado.', invalidAccountReferenceType.map((item) => item.id)))
  const unknownAccountReferences = safeTransactions.filter((item) => item?.accountId && !virtualReference(item.accountId) && !accountIds.has(item.accountId))
  if (unknownAccountReferences.length) issues.push(issue('unknown-account-references', 'critical', 'Existem lan\u00e7amentos vinculados a contas inexistentes.', unknownAccountReferences.length, 'Restaure a conta correspondente ou reatribua manualmente ap\u00f3s validar o hist\u00f3rico.', unknownAccountReferences.map((item) => item.id)))
  const cardPurchasesWithAccount = safeTransactions.filter((item) => item?.cardId && item.accountId)
  if (cardPurchasesWithAccount.length) issues.push(issue('card-purchases-with-bank-account', 'high', 'Existem compras no cart\u00e3o com accountId banc\u00e1rio.', cardPurchasesWithAccount.length, 'Remova a atribui\u00e7\u00e3o banc\u00e1ria somente ap\u00f3s confirmar que o pagamento da fatura registra a conta pagadora.', cardPurchasesWithAccount.map((item) => item.id)))
  const persistedVirtualReferences = safeTransactions.filter((item) => virtualReference(item?.accountId))
  if (persistedVirtualReferences.length) issues.push(issue('persisted-virtual-account-reference', 'high', 'Existem lan\u00e7amentos apontando para a conta virtual.', persistedVirtualReferences.length, 'Deixe o accountId ausente para representar "Sem conta definida"; n\u00e3o atribua outra conta automaticamente.', persistedVirtualReferences.map((item) => item.id)))
  const paymentEntries = safeInvoices.flatMap((record) => (Array.isArray(record?.paymentHistory) ? record.paymentHistory : []).map((payment) => ({ ...payment, invoiceId: record.id })))
  const unknownPaymentAccounts = paymentEntries.filter((payment) => payment.accountId && !virtualReference(payment.accountId) && !accountIds.has(payment.accountId))
  if (unknownPaymentAccounts.length) issues.push(issue('unknown-invoice-payment-account', 'critical', 'Existem pagamentos de fatura vinculados a contas inexistentes.', unknownPaymentAccounts.length, 'Restaure a conta pagadora ou corrija a refer\u00eancia depois de conferir o comprovante.', unknownPaymentAccounts.map((payment) => payment.invoiceId)))
  const invalidPaymentEntries = paymentEntries.filter((payment) => !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0 || (payment.paymentDate && !validDate(payment.paymentDate)) || (payment.paidAt && Number.isNaN(Date.parse(payment.paidAt))) || (payment.operationId !== undefined && payment.operationId !== null && typeof payment.operationId !== 'string'))
  if (invalidPaymentEntries.length) issues.push(issue('invalid-invoice-payment-history', 'high', 'Existem pagamentos de fatura com valor, data ou opera\u00e7\u00e3o inv\u00e1lidos.', invalidPaymentEntries.length, 'Revise o hist\u00f3rico de pagamento manualmente; n\u00e3o gere uma nova despesa para compensar.', invalidPaymentEntries.map((payment) => payment.invoiceId)))
  const duplicatePaymentOperations = duplicates(paymentEntries, (payment) => payment.operationId)
  if (duplicatePaymentOperations.length) issues.push(issue('duplicate-invoice-payment-operation', 'critical', 'Existem opera\u00e7\u00f5es de pagamento de fatura repetidas.', duplicatePaymentOperations.reduce((sum, [, count]) => sum + count - 1, 0), 'Confirme os comprovantes antes de alterar o hist\u00f3rico de pagamentos.', duplicatePaymentOperations.map(([operationId]) => operationId)))
  const virtualPaymentReferences = paymentEntries.filter((payment) => virtualReference(payment.accountId))
  if (virtualPaymentReferences.length) issues.push(issue('persisted-virtual-payment-account', 'high', 'Existem pagamentos de fatura apontando para a conta virtual.', virtualPaymentReferences.length, 'Remova apenas a refer\u00eancia virtual; uma conta pagadora ausente deve ser nula.', virtualPaymentReferences.map((payment) => payment.invoiceId)))

  const duplicateTransferIds = duplicates(safeTransfers, (transfer) => transfer?.transferId)
  if (duplicateTransferIds.length) issues.push(issue('duplicate-transfer-ids', 'critical', 'Existem transfer\u00eancias com o mesmo transferId.', duplicateTransferIds.reduce((sum, [, count]) => sum + count - 1, 0), 'N\u00e3o exclua registros automaticamente; preserve a transfer\u00eancia correta e revise a auditoria.', duplicateTransferIds.map(([transferId]) => transferId)))
  const duplicateTransferOperations = duplicates(safeTransfers.flatMap((transfer) => getTransferOperationIds(transfer).map((operationId) => ({ operationId }))), (entry) => entry.operationId)
  if (duplicateTransferOperations.length) issues.push(issue('duplicate-transfer-operations', 'critical', 'Existem operationId de transfer\u00eancia repetidos.', duplicateTransferOperations.reduce((sum, [, count]) => sum + count - 1, 0), 'Revise reexecu\u00e7\u00f5es e mantenha apenas a opera\u00e7\u00e3o confirmada.', duplicateTransferOperations.map(([operationId]) => operationId)))
  const missingTransferSources = safeTransfers.filter((transfer) => typeof transfer?.sourceAccountId !== 'string' || !transfer.sourceAccountId)
  if (missingTransferSources.length) issues.push(issue('missing-transfer-source-account', 'critical', 'Existem transfer\u00eancias sem conta de origem.', missingTransferSources.length, 'Restaure a conta de origem ou revise manualmente o registro.', missingTransferSources.map((transfer) => transfer?.transferId || 'sem transferId')))
  const missingTransferDestinations = safeTransfers.filter((transfer) => typeof transfer?.destinationAccountId !== 'string' || !transfer.destinationAccountId)
  if (missingTransferDestinations.length) issues.push(issue('missing-transfer-destination-account', 'critical', 'Existem transfer\u00eancias sem conta de destino.', missingTransferDestinations.length, 'Restaure a conta de destino ou revise manualmente o registro.', missingTransferDestinations.map((transfer) => transfer?.transferId || 'sem transferId')))
  const sameTransferAccounts = safeTransfers.filter((transfer) => transfer?.sourceAccountId && transfer.sourceAccountId === transfer.destinationAccountId)
  if (sameTransferAccounts.length) issues.push(issue('same-transfer-accounts', 'critical', 'Existem transfer\u00eancias com origem e destino iguais.', sameTransferAccounts.length, 'Escolha duas contas diferentes; a transfer\u00eancia interna n\u00e3o pode apontar para a pr\u00f3pria conta.', sameTransferAccounts.map((transfer) => transfer.transferId)))
  const invalidTransferReferences = safeTransfers.filter((transfer) => (transfer?.sourceAccountId && !accountIds.has(transfer.sourceAccountId)) || (transfer?.destinationAccountId && !accountIds.has(transfer.destinationAccountId)))
  if (invalidTransferReferences.length) issues.push(issue('invalid-transfer-account-references', 'critical', 'Existem transfer\u00eancias apontando para contas inexistentes.', invalidTransferReferences.length, 'Restaure as contas referenciadas antes de alterar o hist\u00f3rico.', invalidTransferReferences.map((transfer) => transfer.transferId || 'sem transferId')))
  const invalidTransferAmounts = safeTransfers.filter((transfer) => !Number.isFinite(Number(transfer?.amount)) || Number(transfer.amount) <= 0)
  if (invalidTransferAmounts.length) issues.push(issue('invalid-transfer-amounts', 'critical', 'Existem valores de transfer\u00eancia inv\u00e1lidos.', invalidTransferAmounts.length, 'Revise o valor sem criar receita ou despesa de compensa\u00e7\u00e3o.', invalidTransferAmounts.map((transfer) => transfer?.transferId || 'sem transferId')))
  const invalidTransferDates = safeTransfers.filter((transfer) => !validDate(transfer?.date))
  if (invalidTransferDates.length) issues.push(issue('invalid-transfer-dates', 'high', 'Existem datas de transfer\u00eancia inv\u00e1lidas.', invalidTransferDates.length, 'Confirme a data financeira original antes de corrigir.', invalidTransferDates.map((transfer) => transfer?.transferId || 'sem transferId')))
  const invalidTransferStatuses = safeTransfers.filter((transfer) => !TRANSFER_STATUSES.includes(transfer?.status))
  if (invalidTransferStatuses.length) issues.push(issue('invalid-transfer-statuses', 'high', 'Existem status de transfer\u00eancia inv\u00e1lidos.', invalidTransferStatuses.length, 'Use somente agendada, conclu\u00edda ou cancelada.', invalidTransferStatuses.map((transfer) => transfer?.transferId || 'sem transferId')))
  const invalidTransferFees = safeTransfers.filter((transfer) => !Number.isFinite(Number(transfer?.fee ?? 0)) || Number(transfer?.fee || 0) < 0 || Number(transfer?.fee || 0) !== 0)
  if (invalidTransferFees.length) issues.push(issue('invalid-transfer-fees', 'high', 'Existem taxas de transfer\u00eancia incompat\u00edveis com esta fase.', invalidTransferFees.length, 'Mantenha a taxa em zero at\u00e9 existir uma despesa financeira separada e audit\u00e1vel.', invalidTransferFees.map((transfer) => transfer?.transferId || 'sem transferId')))
  const invalidTransferRecords = safeTransfers.filter((transfer) => !validateTransferRecord(transfer, { accounts: safeAccounts, allowArchived: true }).valid)
  if (invalidTransferRecords.length) issues.push(issue('invalid-transfer-records', 'critical', 'Existem transfer\u00eancias incompletas ou com estrutura inv\u00e1lida.', invalidTransferRecords.length, 'Restaure um backup ou revise cada campo manualmente; o diagn\u00f3stico n\u00e3o altera dados.', invalidTransferRecords.map((transfer) => transfer?.transferId || 'sem transferId')))
  const reversalIds = duplicates(safeTransfers.filter((transfer) => transfer?.reversal), (transfer) => transfer.reversal?.reversalId)
  const reversalOperations = duplicates(safeTransfers.filter((transfer) => transfer?.reversal), (transfer) => transfer.reversal?.operationId)
  const invalidReversals = safeTransfers.filter((transfer) => transfer?.reversal && !validateTransferRecord(transfer, { accounts: safeAccounts, allowArchived: true }).valid)
  if (reversalIds.length || reversalOperations.length || invalidReversals.length) issues.push(issue('invalid-transfer-reversals', 'critical', 'Existem estornos de transfer\u00eancia duplicados ou inv\u00e1lidos.', reversalIds.length + reversalOperations.length + invalidReversals.length, 'Preserve a transfer\u00eancia original e revise o evento de estorno sem apag\u00e1-lo silenciosamente.', [...reversalIds.map(([id]) => id), ...reversalOperations.map(([id]) => id), ...invalidReversals.map((transfer) => transfer.transferId)]))

  // The canonical transfer model has no persisted debit/credit transactions. Any such side is a legacy or partial residue.
  const transferSides = safeTransactions.filter((transaction) => transaction?.transferId)
  if (transferSides.length) {
    const sidesByTransfer = new Map()
    transferSides.forEach((side) => { const group = sidesByTransfer.get(side.transferId) || []; group.push(side); sidesByTransfer.set(side.transferId, group) })
    const incompleteSides = [...sidesByTransfer.entries()].filter(([, sides]) => sides.length !== 2)
    const divergentSides = [...sidesByTransfer.entries()].filter(([, sides]) => sides.length === 2 && Math.abs(Number(sides[0].amount) - Number(sides[1].amount)) > 0.001)
    const nonCompletedSides = safeTransfers.filter((transfer) => ['scheduled', 'cancelled'].includes(transfer?.status) && sidesByTransfer.has(transfer.transferId))
    issues.push(issue('unexpected-transfer-transaction-sides', 'high', 'Existem lados de transfer\u00eancia persistidos como lan\u00e7amentos financeiros.', transferSides.length, 'Esta vers\u00e3o usa um registro can\u00f4nico; revise os res\u00edduos sem convert\u00ea-los automaticamente.', [...sidesByTransfer.keys()]))
    if (incompleteSides.length) issues.push(issue('incomplete-transfer-sides', 'critical', 'Existem transfer\u00eancias com apenas um lado persistido.', incompleteSides.length, 'N\u00e3o gere o lado ausente automaticamente; recupere o registro can\u00f4nico ou um backup.', incompleteSides.map(([transferId]) => transferId)))
    if (divergentSides.length) issues.push(issue('divergent-transfer-sides', 'critical', 'Existem lados de transfer\u00eancia com valores divergentes.', divergentSides.length, 'Revise valores e poss\u00edveis taxas antes de qualquer corre\u00e7\u00e3o manual.', divergentSides.map(([transferId]) => transferId)))
    if (nonCompletedSides.length) issues.push(issue('non-realized-transfer-affecting-balance', 'critical', 'Transfer\u00eancias agendadas ou canceladas possuem lados financeiros persistidos.', nonCompletedSides.length, 'Revise o hist\u00f3rico; esses status n\u00e3o devem afetar saldo realizado.', nonCompletedSides.map((transfer) => transfer.transferId)))
  }

  const duplicateRecurrenceIds = duplicates(safeRecurrences, (recurrence) => recurrence?.recurrenceId)
  if (duplicateRecurrenceIds.length) issues.push(issue('duplicate-recurrence-ids', 'critical', 'Existem recorr\u00eancias com o mesmo recurrenceId.', duplicateRecurrenceIds.reduce((sum, [, count]) => sum + count - 1, 0), 'N\u00e3o mescle regras automaticamente; preserve o hist\u00f3rico e revise cada regra.', duplicateRecurrenceIds.map(([recurrenceId]) => recurrenceId)))
  const invalidRecurrences = safeRecurrences.filter((recurrence) => !validateRecurrenceRecord(recurrence, { accounts: safeAccounts, cards: safeCards, allowArchived: true }).valid)
  if (invalidRecurrences.length) issues.push(issue('invalid-recurrence-records', 'critical', 'Existem regras recorrentes incompletas ou inv\u00e1lidas.', invalidRecurrences.length, 'Revise a regra e suas refer\u00eancias sem gerar novas ocorr\u00eancias automaticamente.', invalidRecurrences.map((recurrence) => recurrence?.recurrenceId || 'recorr\u00eancia sem identifica\u00e7\u00e3o')))
  const invalidRecurrenceAccounts = safeRecurrences.filter((recurrence) => [recurrence?.accountId, recurrence?.sourceAccountId, recurrence?.destinationAccountId].some((accountId) => accountId && !accountIds.has(accountId)))
  if (invalidRecurrenceAccounts.length) issues.push(issue('invalid-recurrence-account-references', 'critical', 'Existem recorr\u00eancias apontando para contas inexistentes.', invalidRecurrenceAccounts.length, 'Restaure as contas referenciadas ou corrija a regra ap\u00f3s conferir o compromisso financeiro.', invalidRecurrenceAccounts.map((recurrence) => recurrence?.recurrenceId || 'sem recurrenceId')))
  const invalidRecurrenceCards = safeRecurrences.filter((recurrence) => recurrence?.cardId && !cardIds.has(recurrence.cardId))
  const invalidRecurrenceCategories = safeRecurrences.filter((recurrence) => recurrence?.category && !safeCategories.includes(recurrence.category))
  if (invalidRecurrenceCategories.length) issues.push(issue('invalid-recurrence-category-references', 'medium', 'Existem recorrências apontando para categorias inexistentes.', invalidRecurrenceCategories.length, 'Restaure a categoria ou escolha outra classificação sem alterar ocorrências realizadas.', invalidRecurrenceCategories.map((recurrence) => recurrence?.recurrenceId || 'sem recurrenceId')))
  if (invalidRecurrenceCards.length) issues.push(issue('invalid-recurrence-card-references', 'critical', 'Existem recorr\u00eancias apontando para cart\u00f5es inexistentes.', invalidRecurrenceCards.length, 'Restaure o cart\u00e3o ou edite a regra sem alterar as ocorr\u00eancias j\u00e1 geradas.', invalidRecurrenceCards.map((recurrence) => recurrence?.recurrenceId || 'sem recurrenceId')))

  const recurringEntries = [
    ...safeTransactions.map((record) => ({ record, kind: 'transaction' })),
    ...safeTransfers.map((record) => ({ record, kind: 'transfer' })),
  ].filter(({ record }) => ['recurrenceId', 'recurrenceType', 'recurrenceOccurrenceId', 'scheduledOccurrenceDate', 'generatedFromRecurrence', 'detachedFromRecurrence', 'recurrenceVersion'].some((field) => record?.[field] !== undefined))
  const malformedRecurringOccurrences = recurringEntries.filter(({ record }) => typeof record?.recurrenceId !== 'string' || !record.recurrenceId || typeof record.recurrenceOccurrenceId !== 'string' || !record.recurrenceOccurrenceId || !validDate(record.scheduledOccurrenceDate) || record.generatedFromRecurrence !== true || (record.detachedFromRecurrence !== undefined && typeof record.detachedFromRecurrence !== 'boolean'))
  if (malformedRecurringOccurrences.length) issues.push(issue('invalid-recurrence-occurrence-metadata', 'high', 'Existem ocorr\u00eancias recorrentes sem identidade ou data v\u00e1lida.', malformedRecurringOccurrences.length, 'N\u00e3o regenere registros manualmente; recupere a regra ou um backup e revise a ocorr\u00eancia.', malformedRecurringOccurrences.map(({ record }) => record?.id || record?.transferId || record?.recurrenceId || 'ocorr\u00eancia inv\u00e1lida')))
  const duplicateOccurrenceKeys = duplicates(recurringEntries, ({ record }) => getOccurrenceKeyFromRecord(record))
  if (duplicateOccurrenceKeys.length) issues.push(issue('duplicate-recurrence-occurrences', 'critical', 'Existem ocorr\u00eancias recorrentes duplicadas para a mesma regra e data.', duplicateOccurrenceKeys.reduce((sum, [, count]) => sum + count - 1, 0), 'Mantenha apenas a ocorr\u00eancia confirmada ap\u00f3s comparar seus identificadores e status.', duplicateOccurrenceKeys.map(([key]) => key)))
  const recurrenceById = new Map(safeRecurrences.map((recurrence) => [recurrence?.recurrenceId, recurrence]))
  const unlinkedRecurringOccurrences = recurringEntries.filter(({ record }) => record?.recurrenceId && !recurrenceById.has(record.recurrenceId))
  if (unlinkedRecurringOccurrences.length) issues.push(issue('orphan-recurrence-occurrences', 'high', 'Existem ocorr\u00eancias recorrentes sem regra correspondente.', unlinkedRecurringOccurrences.length, 'N\u00e3o crie uma regra substituta automaticamente; restaure a regra original ou revise o registro individual.', unlinkedRecurringOccurrences.map(({ record }) => record?.recurrenceOccurrenceId || record?.id || record?.transferId)))
  const inconsistentRecurringTransfers = recurringEntries.filter(({ record, kind }) => {
    const recurrence = recurrenceById.get(record?.recurrenceId)
    if (!recurrence) return false
    return (recurrence.type === 'transfer' && kind !== 'transfer') || (recurrence.type !== 'transfer' && kind === 'transfer') || (record.recurrenceType !== undefined && record.recurrenceType !== recurrence.type)
  })
  if (inconsistentRecurringTransfers.length) issues.push(issue('inconsistent-recurring-transfer-occurrences', 'critical', 'Existem ocorr\u00eancias cuja natureza n\u00e3o corresponde \u00e0 regra recorrente.', inconsistentRecurringTransfers.length, 'Transfer\u00eancias recorrentes devem existir somente na cole\u00e7\u00e3o de transfer\u00eancias agendadas; revise o registro sem compensar com receita ou despesa.', inconsistentRecurringTransfers.map(({ record }) => record?.recurrenceOccurrenceId || record?.transferId || record?.id)))

  const invalidRecurrenceCursors = safeRecurrences.filter((recurrence) => !validDate(recurrence?.nextOccurrenceDate) || getOccurrenceOrdinal(recurrence, recurrence.nextOccurrenceDate) < 0)
  if (invalidRecurrenceCursors.length) issues.push(issue('invalid-recurrence-cursors', 'high', 'Existem próximas ocorrências que não pertencem ao calendário da regra.', invalidRecurrenceCursors.length, 'Revise a próxima ocorrência sem alterar o histórico já realizado.', invalidRecurrenceCursors.map((recurrence) => recurrence?.recurrenceId || 'recorrência sem identificação')))
  const occurrencesAfterEnd = recurringEntries.filter(({ record }) => {
    const recurrence = recurrenceById.get(record?.recurrenceId)
    return recurrence?.endDate && validDate(record?.scheduledOccurrenceDate) && record.scheduledOccurrenceDate > recurrence.endDate
  })
  if (occurrencesAfterEnd.length) issues.push(issue('recurrence-occurrences-after-end-date', 'high', 'Existem ocorrências depois da data final de suas regras.', occurrencesAfterEnd.length, 'Preserve os registros realizados e revise as ocorrências futuras individualmente.', occurrencesAfterEnd.map(({ record }) => record?.recurrenceOccurrenceId || record?.id || record?.transferId)))
  const occurrenceLimitExceeded = safeRecurrences.filter((recurrence) => recurrence?.occurrenceLimit != null && new Set(recurringEntries.filter(({ record }) => record?.recurrenceId === recurrence.recurrenceId).map(({ record }) => `${record?.recurrenceType || recurrence.type}:${record?.scheduledOccurrenceDate || record?.date || ''}`)).size > Number(recurrence.occurrenceLimit))
  if (occurrenceLimitExceeded.length) issues.push(issue('recurrence-occurrence-limit-exceeded', 'high', 'Existem regras com mais ocorrências do que o limite configurado.', occurrenceLimitExceeded.length, 'Não apague ocorrências realizadas; revise a regra e as ocorrências futuras antes de corrigir.', occurrenceLimitExceeded.map((recurrence) => recurrence.recurrenceId)))
  const canonicalOccurrenceDuplicates = duplicates(recurringEntries, ({ record, kind }) => {
    if (!record?.recurrenceId || !validDate(record?.scheduledOccurrenceDate)) return ''
    const type = record.recurrenceType || (kind === 'transfer' ? 'transfer' : record.type)
    return `${record.recurrenceId}:${type}:${record.scheduledOccurrenceDate}`
  })
  if (canonicalOccurrenceDuplicates.length) issues.push(issue('duplicate-recurrence-occurrence-schedules', 'critical', 'Existem ocorrências duplicadas para a mesma série, tipo e data, mesmo com IDs diferentes.', canonicalOccurrenceDuplicates.reduce((sum, [, count]) => sum + count - 1, 0), 'Mantenha a ocorrência confirmada após comparar as identidades; não regenere a série.', canonicalOccurrenceDuplicates.map(([key]) => key)))
  const partialGenerationFailures = safeRecurrences.filter((recurrence) => recurrence?.generationError)
  if (partialGenerationFailures.length) issues.push(issue('recurrence-generation-failures', 'high', 'Existem regras com falha parcial ou pendente de geração.', partialGenerationFailures.length, 'Revise a referência inválida ou a fatura paga antes de executar a geração novamente.', partialGenerationFailures.map((recurrence) => recurrence.recurrenceId)))
  const recurringCardInstallments = safeTransactions.filter((transaction) => transaction?.recurrenceId && transaction?.cardId && Number(transaction.installmentTotal || 1) !== 1)
  if (recurringCardInstallments.length) issues.push(issue('recurring-card-installment-conflict', 'critical', 'Existem recorrências de cartão confundidas com parcelamentos.', recurringCardInstallments.length, 'Cada recorrência de cartão deve gerar uma nova compra única 1/1; preserve o parcelamento original e revise a ocorrência.', recurringCardInstallments.map((transaction) => transaction.id || transaction.recurrenceOccurrenceId)))

  const invalidAlertStates = safeAlertStates.filter((state) => !state || typeof state !== 'object' || Array.isArray(state) || typeof state.alertKey !== 'string' || !state.alertKey || (state.dismissed !== undefined && typeof state.dismissed !== 'boolean') || (state.read !== undefined && typeof state.read !== 'boolean') || (state.snoozedUntil !== undefined && state.snoozedUntil !== null && (typeof state.snoozedUntil !== 'string' || Number.isNaN(Date.parse(state.snoozedUntil)))))
  if (invalidAlertStates.length) issues.push(issue('invalid-alert-states', 'medium', 'Existem estados persistidos de alerta inv\u00e1lidos.', invalidAlertStates.length, 'Limpe apenas o estado de interface depois de exportar um backup; os alertas financeiros s\u00e3o derivados e n\u00e3o devem alterar dados.', invalidAlertStates.map((state) => state?.alertKey || 'estado inv\u00e1lido')))
  const invalidAlertDates = safeAlertStates.filter((state) => ['updatedAt', 'dismissedAt'].some((field) => state?.[field] !== undefined && state?.[field] !== null && (typeof state[field] !== 'string' || Number.isNaN(Date.parse(state[field])))))
  if (invalidAlertDates.length) issues.push(issue('invalid-alert-state-dates', 'low', 'Existem datas t\u00e9cnicas inv\u00e1lidas em estados de alerta.', invalidAlertDates.length, 'Revise somente o estado de leitura, dispensa ou adiamento; nenhum dado financeiro deve ser alterado.', invalidAlertDates.map((state) => state?.alertKey || 'estado inv\u00e1lido')))
  const duplicateAlertKeys = duplicates(safeAlertStates, (state) => state?.alertKey)
  if (duplicateAlertKeys.length) issues.push(issue('duplicate-alert-states', 'medium', 'Existem estados duplicados para o mesmo alerta.', duplicateAlertKeys.reduce((sum, [, count]) => sum + count - 1, 0), 'Mantenha somente o estado mais recente do alerta sem alterar o dado financeiro de origem.', duplicateAlertKeys.map(([key]) => key)))
  let derivedAlertKeys = new Set()
  try {
    derivedAlertKeys = new Set(deriveFinanceAlerts({ transactions: safeTransactions, transfers: safeTransfers, invoices: buildInvoices(safeTransactions, safeCards, safeInvoices), invoiceRecords: safeInvoices, accounts: safeAccounts, cards: safeCards, recurrences: safeRecurrences }).map((alert) => alert.alertKey))
  } catch { /* Diagnostics must remain read-only even if malformed data prevents alert derivation. */ }
  const orphanAlertStates = safeAlertStates.filter((state) => state?.alertKey && derivedAlertKeys.size && !derivedAlertKeys.has(state.alertKey))
  if (orphanAlertStates.length) issues.push(issue('orphan-alert-states', 'low', 'Existem estados de alerta para eventos que já não estão ativos.', orphanAlertStates.length, 'Esses estados não alteram dados financeiros; revise-os depois de exportar um backup.', orphanAlertStates.map((state) => state.alertKey)))

  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count)
  return { generatedAt: new Date().toISOString(), healthy: issues.length === 0, issues, summary: { transactions: safeTransactions.length, cards: safeCards.length, accounts: safeAccounts.length, transfers: safeTransfers.length, recurrences: safeRecurrences.length, alertStates: safeAlertStates.length, invoiceRecords: safeInvoices.length, problems: issues.reduce((sum, item) => sum + item.count, 0) } }
}

export const runFinanceDiagnostics = (storage, runtime = {}) => {
  if (!storage) return analyzeFinanceData({ storageErrors: ['Armazenamento indisponível.'], missingKeys: [] })
  const snapshot = readFinanceStorage(storage)
  const required = ['clareza:transactions', 'clareza:cards', 'clareza:categories', 'clareza:invoices', 'financeDataVersion']
  const runtimeValues = { 'clareza:transactions': runtime.transactions, 'clareza:cards': runtime.cards, 'clareza:accounts': runtime.accounts, 'clareza:transfers': runtime.transfers, 'clareza:recurrences': runtime.recurrences, 'clareza:alertStates': runtime.alertStates, 'clareza:categories': runtime.categories, 'clareza:invoices': runtime.invoicePayments }
  const missingKeys = required.filter((key) => snapshot.values[key] === null && runtimeValues[key] === undefined)
  const report = analyzeFinanceData({
    transactions: runtime.transactions ?? snapshot.values['clareza:transactions'],
    cards: runtime.cards ?? snapshot.values['clareza:cards'],
    accounts: runtime.accounts ?? snapshot.values['clareza:accounts'] ?? [],
    transfers: runtime.transfers ?? snapshot.values['clareza:transfers'] ?? [],
    recurrences: runtime.recurrences ?? snapshot.values['clareza:recurrences'] ?? [],
    alertStates: runtime.alertStates ?? snapshot.values['clareza:alertStates'] ?? [],
    categories: runtime.categories ?? snapshot.values['clareza:categories'] ?? [],
    invoiceRecords: runtime.invoicePayments ?? snapshot.values['clareza:invoices'],
    financeVersion: runtime.financeVersion ?? snapshot.values.financeDataVersion,
    storageErrors: snapshot.errors, missingKeys,
  })
  const persistence = inspectPersistence(storage)
  const hasSnapshots = persistence.current.exists || persistence.temp.exists || persistence.lastValid.exists
  if (hasSnapshots && !persistence.current.valid) report.issues.unshift(issue('invalid-current-snapshot', 'high', 'O snapshot principal está ausente ou inválido.', 1, 'Use o último snapshot válido ou importe um backup confirmado.', persistence.current.errors))
  if (persistence.temp.exists && !persistence.temp.valid) report.issues.unshift(issue('invalid-temporary-snapshot', 'medium', 'Há um snapshot temporário incompleto ou corrompido.', 1, 'Mantenha-o para diagnóstico até confirmar um snapshot principal válido.', persistence.temp.errors))
  if (hasSnapshots && persistence.validCandidates === 0) report.issues.unshift(issue('no-valid-snapshots', 'high', 'Não há snapshots transacionais válidos.', 1, 'Exporte um backup e confirme a persistência antes de continuar alterações.'))
  report.summary.snapshotCandidates = persistence.validCandidates
  report.summary.problems = report.issues.reduce((sum, item) => sum + item.count, 0)
  report.healthy = report.issues.length === 0
  return report
}
