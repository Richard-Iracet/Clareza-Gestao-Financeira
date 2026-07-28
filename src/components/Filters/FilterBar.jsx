import { useMemo, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { accounts, costCenters, necessities } from '../../data/settings'
import { clearFilter, getActiveFilterCount } from '../../utils/filtering'
import { UNASSIGNED_ACCOUNT_ID } from '../../domain/accounts/accountSelectors'

const dateText = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthRange = (offset = 0) => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth() + offset, 1); const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0); return { dateFrom: dateText(start), dateTo: dateText(end) } }
const labels = { search: 'Busca', type: 'Tipo', status: 'Status', dateFrom: 'A partir de', dateTo: 'Até', competenceMonth: 'Competência', competenceYear: 'Ano', cardId: 'Cartão', accountId: 'Conta financeira', category: 'Categoria', costCenter: 'Centro de custo', necessity: 'Necessidade', account: 'Conta', invoiceStatus: 'Fatura', installmentStatus: 'Parcelamento', transferScope: 'Transferências', sourceAccountId: 'Origem', destinationAccountId: 'Destino', transferStatus: 'Status da transferência', minAmount: 'Mínimo', maxAmount: 'Máximo', overdueOnly: 'Vencidos', futureOnly: 'Futuros' }

const recurrenceFilterLabels = { recurrenceScope: 'Origem recorrente', recurrenceId: 'Série', recurrenceStatus: 'Status da série', occurrenceState: 'Estado da ocorrência' }

export default function FilterBar() {
  const { categories, cards, accounts: financialAccounts, recurrences = [], transactions, filters, setFilters, defaultFilters } = useFinance()
  const [advanced, setAdvanced] = useState(false)
  const set = (event) => { const { name, value, type, checked } = event.target; setFilters((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value })) }
  const activeCount = getActiveFilterCount(filters)
  const years = useMemo(() => [...new Set([new Date().getFullYear(), ...transactions.flatMap((item) => [item.invoiceYear, item.competenceYear]).filter(Boolean)])].sort((a, b) => b - a), [transactions])
  const valueLabel = (key, value) => {
    if (key === 'recurrenceScope') return ({ recurring: 'Somente recorrentes', manual: 'Somente manuais' }[value] || value)
    if (key === 'recurrenceId') return recurrences.find((item) => item.recurrenceId === value)?.description || value
    if (key === 'recurrenceStatus') return ({ active: 'Ativa', paused: 'Pausada', completed: 'Encerrada', cancelled: 'Cancelada' }[value] || value)
    if (key === 'occurrenceState') return ({ forecast: 'Prevista', realized: 'Realizada', detached: 'Editada isoladamente' }[value] || value)
    if (key === 'cardId') return cards.find((item) => item.id === value)?.name || value
    if (key === 'accountId') return [UNASSIGNED_ACCOUNT_ID, 'unassigned'].includes(value) ? 'Sem conta definida' : financialAccounts.find((item) => item.accountId === value)?.name || value
    if (key === 'sourceAccountId' || key === 'destinationAccountId') return financialAccounts.find((item) => item.accountId === value)?.name || value
    if (key === 'transferScope') return value === 'only' ? 'Somente transferências' : 'Ocultar transferências'
    if (key === 'transferStatus') return ({ scheduled: 'Agendada', completed: 'Concluída', cancelled: 'Cancelada' }[value] || value)
    return value === true ? 'Sim' : value
  }
  const quick = (changes) => setFilters((current) => ({ ...current, ...changes }))
  const today = dateText(new Date())

  return <div className="filters-panel panel" aria-label="Filtros dos lançamentos">
    <div className="filter-toolbar">
      <label className="search-field"><span aria-hidden="true">⌕</span><input name="search" value={filters.search} onChange={set} placeholder="Buscar em descrição, categoria, cartão..." aria-label="Buscar lançamentos" /></label>
      <label><span className="sr-only">Ordenar lançamentos</span><select name="sort" value={filters.sort} onChange={set} aria-label="Ordenação atual"><option value="newest">Mais recente</option><option value="oldest">Mais antigo</option><option value="highest">Maior valor</option><option value="lowest">Menor valor</option><option value="due">Vencimento mais próximo</option><option value="competence">Competência</option><option value="description">Descrição</option></select></label>
      <button type="button" className="outline-button" aria-expanded={advanced} aria-controls="advanced-filters" onClick={() => setAdvanced((value) => !value)}>Filtros avançados{activeCount ? ` (${activeCount})` : ''}</button>
    </div>
    <div className="quick-filters" aria-label="Filtros rápidos">
      <button type="button" onClick={() => quick({ dateFrom: today, dateTo: today })}>Hoje</button>
      <button type="button" onClick={() => quick(monthRange(0))}>Este mês</button><button type="button" onClick={() => quick(monthRange(-1))}>Mês anterior</button><button type="button" onClick={() => quick(monthRange(1))}>Próximo mês</button>
      <button type="button" onClick={() => quick({ status: 'pending', overdueOnly: false })}>Pendentes</button><button type="button" onClick={() => quick({ overdueOnly: true, status: '' })}>Vencidos</button><button type="button" onClick={() => quick({ status: 'paid', overdueOnly: false })}>Pagos</button>
      <button type="button" onClick={() => quick({ installmentStatus: 'installment' })}>Parcelados</button><button type="button" onClick={() => quick({ type: 'expense' })}>Despesas</button>
    </div>
    {advanced && <div id="advanced-filters" className="advanced-filters">
      <label>Data inicial<input type="date" name="dateFrom" value={filters.dateFrom} onChange={set} /></label><label>Data final<input type="date" name="dateTo" value={filters.dateTo} onChange={set} /></label>
      <label>Mês da competência<select name="competenceMonth" value={filters.competenceMonth} onChange={set}><option value="">Todos</option>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, index, 1))}</option>)}</select></label>
      <label>Ano da competência<select name="competenceYear" value={filters.competenceYear} onChange={set}><option value="">Todos</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
      <label>Valor mínimo<input type="number" min="0" step="0.01" name="minAmount" value={filters.minAmount} onChange={set} /></label><label>Valor máximo<input type="number" min="0" step="0.01" name="maxAmount" value={filters.maxAmount} onChange={set} /></label>
      <label>Categoria<select name="category" value={filters.category} onChange={set}><option value="">Todas</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Cartão<select name="cardId" value={filters.cardId} onChange={set}><option value="">Todos</option>{cards.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Centro de custo<select name="costCenter" value={filters.costCenter} onChange={set}><option value="">Todos</option>{costCenters.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Necessidade<select name="necessity" value={filters.necessity} onChange={set}><option value="">Todas</option>{necessities.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label>Status<select name="status" value={filters.status} onChange={set}><option value="">Todos</option><option value="paid">Pago</option><option value="received">Recebido</option><option value="pending">Pendente</option></select></label>
      <label>Tipo<select name="type" value={filters.type} onChange={set}><option value="">Todos</option><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
      <label>Conta/forma (legada)<select name="account" value={filters.account} onChange={set}><option value="">Todas</option>{accounts.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Conta financeira<select name="accountId" value={filters.accountId} onChange={set}><option value="">Todas</option><option value={UNASSIGNED_ACCOUNT_ID}>Sem conta definida</option>{financialAccounts.map((item) => <option value={item.accountId} key={item.accountId}>{item.name}{item.archived ? ' (arquivada)' : ''}</option>)}</select></label>
      <label>Exibir transferências<select name="transferScope" value={filters.transferScope} onChange={set}><option value="">Lançamentos e transferências</option><option value="only">Somente transferências</option><option value="exclude">Ocultar transferências</option></select></label>
      <label>Conta de origem<select name="sourceAccountId" value={filters.sourceAccountId} onChange={set}><option value="">Todas</option>{financialAccounts.map((item) => <option value={item.accountId} key={item.accountId}>{item.name}{item.archived ? ' (arquivada)' : ''}</option>)}</select></label>
      <label>Conta de destino<select name="destinationAccountId" value={filters.destinationAccountId} onChange={set}><option value="">Todas</option>{financialAccounts.map((item) => <option value={item.accountId} key={item.accountId}>{item.name}{item.archived ? ' (arquivada)' : ''}</option>)}</select></label>
      <label>Status da transferência<select name="transferStatus" value={filters.transferStatus} onChange={set}><option value="">Todos</option><option value="scheduled">Agendada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></select></label>
      <label>Status da fatura<select name="invoiceStatus" value={filters.invoiceStatus} onChange={set}><option value="">Todos</option><option value="open">Aberta</option><option value="closed">Fechada</option><option value="paid">Paga</option><option value="overdue">Vencida</option></select></label>
      <label>Origem do lançamento<select name="recurrenceScope" value={filters.recurrenceScope} onChange={set}><option value="">Todos</option><option value="recurring">Somente recorrentes</option><option value="manual">Somente manuais</option></select></label>
      <label>Série recorrente<select name="recurrenceId" value={filters.recurrenceId} onChange={set}><option value="">Todas</option>{recurrences.map((item) => <option value={item.recurrenceId} key={item.recurrenceId}>{item.description || item.recurrenceId}</option>)}</select></label>
      <label>Status da série<select name="recurrenceStatus" value={filters.recurrenceStatus} onChange={set}><option value="">Todos</option><option value="active">Ativa</option><option value="paused">Pausada</option><option value="completed">Encerrada</option><option value="cancelled">Cancelada</option></select></label>
      <label>Estado da ocorrência<select name="occurrenceState" value={filters.occurrenceState} onChange={set}><option value="">Todos</option><option value="forecast">Prevista</option><option value="realized">Realizada</option><option value="detached">Editada isoladamente</option></select></label>
    </div>}
    {activeCount > 0 && <div className="active-filters" aria-live="polite"><span>{activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}</span>{Object.entries(filters).filter(([key, value]) => key !== 'sort' && value !== '' && value !== false).map(([key, value]) => <button type="button" className="filter-chip" key={key} onClick={() => setFilters((current) => clearFilter(current, key))} aria-label={`Remover filtro ${labels[key] || recurrenceFilterLabels[key] || key}`}>{labels[key] || recurrenceFilterLabels[key] || key}: {valueLabel(key, value)} ×</button>)}<button type="button" className="text-button" onClick={() => setFilters({ ...defaultFilters })}>Limpar filtros</button></div>}
    <p className="filter-scope">Os filtros de transferências afetam apenas os históricos. Transferências nunca entram em receitas, despesas, categorias ou gráficos; os resumos gerais e a previsão mantêm seu período próprio.</p>
  </div>
}
