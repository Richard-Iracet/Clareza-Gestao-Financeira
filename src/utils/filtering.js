import { getTransactionAmount } from './installmentValueCalculations.js'
import { getTransactionCompetence, isTransactionFuture, isTransactionOverdue, isTransactionRealized } from './financialSelectors.js'

export const defaultFilters = Object.freeze({
  search: '', type: '', status: '', dateFrom: '', dateTo: '', competenceMonth: '', competenceYear: '',
  cardId: '', accountId: '', category: '', costCenter: '', necessity: '', account: '', invoiceStatus: '', installmentStatus: '',
  transferScope: '', sourceAccountId: '', destinationAccountId: '', transferStatus: '',
  recurrenceScope: '', recurrenceId: '', recurrenceStatus: '', occurrenceState: '',
  minAmount: '', maxAmount: '', overdueOnly: false, futureOnly: false, sort: 'newest',
})

export const normalizeSearchText = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
const dateValue = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''
const statusLabel = (status) => ({ paid: 'pago', received: 'recebido', pending: 'pendente', open: 'aberto', closed: 'fechado', overdue: 'vencido' }[status] || status || '')

export const matchTransactionSearch = (item, search, { cards = [], invoices = [], indexes } = {}) => {
  const needle = normalizeSearchText(search)
  if (!needle) return true
  const card = indexes?.cardsById?.get(item.cardId) || cards.find((value) => value.id === item.cardId)
  const account = indexes?.accountsById?.get(item.accountId)
  const invoice = indexes?.invoicesById?.get(item.invoiceId) || invoices.find((value) => value.id === item.invoiceId)
  const competence = getTransactionCompetence(item)
  return normalizeSearchText([
    item.description, item.category, card?.name, account?.name, item.account, item.costCenter, item.notes,
    Number(item.installmentTotal) > 1 ? `${item.installmentNumber}/${item.installmentTotal}` : '',
    competence ? `${String(competence.month).padStart(2, '0')}/${competence.year}` : '',
    statusLabel(item.status), statusLabel(invoice?.status || item.invoiceStatus),
  ].filter(Boolean).join(' ')).includes(needle)
}

export const matchDateRange = (item, from, to) => {
  const value = dateValue(item.dueDate || item.date)
  return Boolean(value) && (!from || value >= from) && (!to || value <= to)
}

export const matchCompetence = (item, month, year) => {
  if (!month && !year) return true
  const competence = getTransactionCompetence(item)
  return Boolean(competence) && (!month || competence.month === Number(month)) && (!year || competence.year === Number(year))
}

const compare = (a, b, sort) => {
  if (sort === 'oldest') return dateValue(a.dueDate || a.date).localeCompare(dateValue(b.dueDate || b.date))
  if (sort === 'highest') return getTransactionAmount(b) - getTransactionAmount(a)
  if (sort === 'lowest') return getTransactionAmount(a) - getTransactionAmount(b)
  if (sort === 'due') return dateValue(a.dueDate || a.date).localeCompare(dateValue(b.dueDate || b.date))
  if (sort === 'competence') { const ac = getTransactionCompetence(a); const bc = getTransactionCompetence(b); return ((bc?.year || 0) * 12 + (bc?.month || 0)) - ((ac?.year || 0) * 12 + (ac?.month || 0)) }
  if (sort === 'description') return String(a.description || '').localeCompare(String(b.description || ''), 'pt-BR', { sensitivity: 'base' })
  return dateValue(b.dueDate || b.date).localeCompare(dateValue(a.dueDate || a.date))
}

export const filterTransactions = (transactions = [], filters = defaultFilters, options = {}) => {
  if (filters.transferScope === 'only') return []
  const { cards = [], invoices = [], indexes, recurrences = [], referenceDate = new Date() } = options
  return transactions.filter((item) => {
    const invoiceStatus = indexes?.invoicesById?.get(item.invoiceId)?.status || invoices.find((invoice) => invoice.id === item.invoiceId)?.status || item.invoiceStatus || ''
    const recurrence = indexes?.recurrencesById?.get(item.recurrenceId) || recurrences.find((value) => value.recurrenceId === item.recurrenceId)
    const recurring = Boolean(item.generatedFromRecurrence || item.recurrenceId)
    const amount = getTransactionAmount(item)
    return matchTransactionSearch(item, filters.search, { cards, invoices, indexes })
      && (!filters.type || item.type === filters.type)
      && (!filters.status || item.status === filters.status)
      && (!filters.category || item.category === filters.category)
      && (!filters.costCenter || item.costCenter === filters.costCenter)
      && (!filters.necessity || item.necessity === filters.necessity)
      && (!filters.account || item.account === filters.account)
      && (!filters.cardId || item.cardId === filters.cardId)
      && (!filters.accountId || (['unassigned', '__unassigned__'].includes(filters.accountId) ? (!item.accountId && !item.cardId) : (!item.cardId && item.accountId === filters.accountId)))
      && (!filters.invoiceStatus || invoiceStatus === filters.invoiceStatus)
      && (!filters.installmentStatus || (filters.installmentStatus === 'installment' ? Number(item.installmentTotal) > 1 : Number(item.installmentTotal || 1) <= 1))
      && (!filters.recurrenceScope || (filters.recurrenceScope === 'recurring' ? recurring : !recurring))
      && (!filters.recurrenceId || item.recurrenceId === filters.recurrenceId)
      && (!filters.recurrenceStatus || recurrence?.status === filters.recurrenceStatus)
      && (!filters.occurrenceState || (filters.occurrenceState === 'forecast' ? recurring && !isTransactionRealized(item) : filters.occurrenceState === 'realized' ? recurring && isTransactionRealized(item) : filters.occurrenceState === 'detached' ? recurring && item.detachedFromRecurrence : true))
      && matchDateRange(item, filters.dateFrom, filters.dateTo)
      && matchCompetence(item, filters.competenceMonth, filters.competenceYear)
      && (filters.minAmount === '' || amount >= Number(filters.minAmount))
      && (filters.maxAmount === '' || amount <= Number(filters.maxAmount))
      && (!filters.overdueOnly || isTransactionOverdue(item, referenceDate, invoices))
      && (!filters.futureOnly || isTransactionFuture(item, referenceDate))
  }).sort((a, b) => compare(a, b, filters.sort))
}

export const matchTransferSearch = (transfer, search, { accounts = [] } = {}) => {
  const needle = normalizeSearchText(search)
  if (!needle) return true
  const source = accounts.find((account) => account.accountId === transfer.sourceAccountId)
  const destination = accounts.find((account) => account.accountId === transfer.destinationAccountId)
  return normalizeSearchText([transfer.description, transfer.notes, source?.name, source?.institution, destination?.name, destination?.institution, transfer.status].filter(Boolean).join(' ')).includes(needle)
}

const compareTransfers = (left, right, sort) => {
  if (sort === 'oldest') return dateValue(left.date).localeCompare(dateValue(right.date))
  if (sort === 'highest') return Number(right.amount) - Number(left.amount)
  if (sort === 'lowest') return Number(left.amount) - Number(right.amount)
  if (sort === 'description') return String(left.description || '').localeCompare(String(right.description || ''), 'pt-BR', { sensitivity: 'base' })
  return dateValue(right.date).localeCompare(dateValue(left.date))
}

export const filterTransfers = (transfers = [], filters = defaultFilters, { accounts = [], recurrences = [], referenceDate = new Date() } = {}) => {
  if (filters.transferScope === 'exclude') return []
  const reference = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(referenceDate.getDate()).padStart(2, '0')}`
  return (Array.isArray(transfers) ? transfers : []).filter((transfer) =>
    matchTransferSearch(transfer, filters.search, { accounts })
    && (!filters.sourceAccountId || transfer.sourceAccountId === filters.sourceAccountId)
    && (!filters.destinationAccountId || transfer.destinationAccountId === filters.destinationAccountId)
    && (!filters.transferStatus || transfer.status === filters.transferStatus)
    && (!filters.recurrenceScope || (filters.recurrenceScope === 'recurring' ? Boolean(transfer.generatedFromRecurrence || transfer.recurrenceId) : !transfer.generatedFromRecurrence && !transfer.recurrenceId))
    && (!filters.recurrenceId || transfer.recurrenceId === filters.recurrenceId)
    && (!filters.recurrenceStatus || recurrences.find((item) => item.recurrenceId === transfer.recurrenceId)?.status === filters.recurrenceStatus)
    && (!filters.occurrenceState || (filters.occurrenceState === 'forecast' ? transfer.status === 'scheduled' : filters.occurrenceState === 'realized' ? transfer.status === 'completed' : filters.occurrenceState === 'detached' ? Boolean(transfer.detachedFromRecurrence) : true))
    && matchDateRange(transfer, filters.dateFrom, filters.dateTo)
    && (!filters.overdueOnly || (transfer.status === 'scheduled' && dateValue(transfer.date) < reference))
    && (!filters.futureOnly || dateValue(transfer.date) > reference)
    && (filters.minAmount === '' || Number(transfer.amount) >= Number(filters.minAmount))
    && (filters.maxAmount === '' || Number(transfer.amount) <= Number(filters.maxAmount))
  ).sort((left, right) => compareTransfers(left, right, filters.sort))
}

export const filterInvoices = (invoices = [], filters = defaultFilters) => invoices.filter((invoice) =>
  (!filters.cardId || invoice.cardId === filters.cardId)
  && (!filters.invoiceStatus || invoice.status === filters.invoiceStatus)
  && (!filters.competenceMonth || Number(invoice.invoiceMonth) === Number(filters.competenceMonth))
  && (!filters.competenceYear || Number(invoice.invoiceYear) === Number(filters.competenceYear)))

export const getActiveFilterCount = (filters = {}) => Object.entries(filters).filter(([key, value]) => key !== 'sort' && value !== '' && value !== false && value != null).length
export const clearFilter = (filters, key) => ({ ...filters, [key]: typeof defaultFilters[key] === 'boolean' ? false : defaultFilters[key] ?? '' })
export const getFilteredTotal = (items = []) => items.reduce((total, item) => total + (item.type === 'income' ? getTransactionAmount(item) : -getTransactionAmount(item)), 0)
