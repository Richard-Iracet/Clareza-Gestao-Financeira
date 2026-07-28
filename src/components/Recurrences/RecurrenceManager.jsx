import { useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../Common/ConfirmDialog'
import { useFinance } from '../../context/FinanceContext'
import { formatCurrency, formatDate } from '../../utils/currency'

const FREQUENCIES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
]

const PAYMENT_METHODS = ['Pix', 'Débito', 'Dinheiro', 'Crédito', 'Boleto', 'Transferência']
const recurrenceStatuses = {
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const operationId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const parseAmount = (value) => Number(String(value ?? '').replace(',', '.'))
const isMoneyInput = (value) => /^\d*[.,]?\d{0,2}$/.test(value)
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const safeFormatDate = (value) => isDate(value) ? formatDate(String(value).slice(0, 10)) : '—'

const emptyForm = () => ({
  type: 'expense',
  frequency: 'monthly',
  interval: '1',
  startDate: today(),
  endDate: '',
  occurrenceLimit: '',
  amount: '',
  description: '',
  category: '',
  accountId: '',
  paymentMethod: 'Pix',
  cardId: '',
  sourceAccountId: '',
  destinationAccountId: '',
  generationMode: 'automatic',
  advanceGenerationDays: '60',
  reminderDaysBefore: '3',
  notes: '',
  effectiveFrom: '',
  editScope: 'rule',
})

const formFromRecurrence = (recurrence) => ({
  ...emptyForm(),
  ...recurrence,
  interval: String(recurrence.interval ?? 1),
  occurrenceLimit: recurrence.occurrenceLimit == null ? '' : String(recurrence.occurrenceLimit),
  amount: recurrence.amount == null ? '' : String(recurrence.amount),
  advanceGenerationDays: String(recurrence.advanceGenerationDays ?? 60),
  reminderDaysBefore: recurrence.reminderDaysBefore == null ? '' : String(recurrence.reminderDaysBefore),
  endDate: recurrence.endDate || '',
  effectiveFrom: '',
})

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate()
const parseLocalDate = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) ? { year, month, day } : null
}
const toIsoDate = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const addDays = (source, days) => {
  const date = new Date(source.year, source.month - 1, source.day, 12)
  date.setDate(date.getDate() + days)
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

const occurrenceDateAt = (startDate, frequency, interval, index) => {
  const source = parseLocalDate(startDate)
  if (!source) return ''
  const safeInterval = Math.max(1, Number(interval) || 1)
  if (frequency === 'daily') return toIsoDate(addDays(source, safeInterval * index))
  if (frequency === 'weekly') return toIsoDate(addDays(source, safeInterval * index * 7))
  if (frequency === 'monthly') {
    const monthOffset = safeInterval * index
    const totalMonths = (source.month - 1) + monthOffset
    const year = source.year + Math.floor(totalMonths / 12)
    const monthIndex = ((totalMonths % 12) + 12) % 12
    return toIsoDate({ year, month: monthIndex + 1, day: Math.min(source.day, daysInMonth(year, monthIndex)) })
  }
  const year = source.year + (safeInterval * index)
  return toIsoDate({ year, month: source.month, day: Math.min(source.day, daysInMonth(year, source.month - 1)) })
}

const previewOccurrences = (form) => {
  if (!isDate(form.startDate)) return []
  const endDate = isDate(form.endDate) ? form.endDate : null
  const limit = form.occurrenceLimit === '' ? null : Math.max(0, Number(form.occurrenceLimit) || 0)
  const previews = []
  for (let index = 0; index < 3; index += 1) {
    if (limit !== null && index >= limit) break
    const date = occurrenceDateAt(form.startDate, form.frequency, form.interval, index)
    if (!date || (endDate && date > endDate)) break
    previews.push(date)
  }
  return previews
}

const accountLabel = (accounts, accountId) => accounts.find((account) => account.accountId === accountId)?.name || 'Conta indisponível'
const cardLabel = (cards, cardId) => cards.find((card) => card.id === cardId)?.name || 'Cartão indisponível'

const occurrenceRowsFor = (recurrence, transactions, transfers) => {
  const fromTransactions = transactions
    .filter((transaction) => transaction.recurrenceId === recurrence.recurrenceId && transaction.generatedFromRecurrence)
    .map((transaction) => ({
      occurrenceId: transaction.id,
      occurrenceType: 'transaction',
      date: transaction.scheduledOccurrenceDate || transaction.dueDate || transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      status: transaction.status,
      detached: Boolean(transaction.detachedFromRecurrence),
    }))
  const fromTransfers = transfers
    .filter((transfer) => transfer.recurrenceId === recurrence.recurrenceId && transfer.generatedFromRecurrence)
    .map((transfer) => ({
      occurrenceId: transfer.transferId,
      occurrenceType: 'transfer',
      date: transfer.scheduledOccurrenceDate || transfer.date,
      description: transfer.description,
      amount: transfer.amount,
      status: transfer.status,
      detached: Boolean(transfer.detachedFromRecurrence),
    }))
  return [...fromTransactions, ...fromTransfers].sort((left, right) => String(left.date).localeCompare(String(right.date)))
}

export default function RecurrenceManager() {
  const {
    recurrences = [],
    transactions = [],
    transfers = [],
    accounts = [],
    cards = [],
    categories = [],
    persistence = {},
    createRecurrence,
    updateRecurrence,
    pauseRecurrence,
    resumeRecurrence,
    completeRecurrence,
    cancelRecurrence,
    deleteRecurrence,
    generateRecurrenceOccurrences,
    updateRecurrenceOccurrence,
  } = useFinance()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [awaitingPersistence, setAwaitingPersistence] = useState(null)
  const [sawSaving, setSawSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const [showOccurrencesFor, setShowOccurrencesFor] = useState(null)

  const previews = useMemo(() => previewOccurrences(form), [form])
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived || account.accountId === form.accountId || account.accountId === form.sourceAccountId || account.accountId === form.destinationAccountId), [accounts, form.accountId, form.destinationAccountId, form.sourceAccountId])
  const recurrenceRows = useMemo(() => recurrences
    .map((recurrence) => ({ recurrence, occurrences: occurrenceRowsFor(recurrence, transactions, transfers) }))
    .sort((left, right) => {
      const order = { active: 0, paused: 1, completed: 2, cancelled: 3 }
      return (order[left.recurrence.status] ?? 4) - (order[right.recurrence.status] ?? 4) || String(left.recurrence.nextOccurrenceDate || '').localeCompare(String(right.recurrence.nextOccurrenceDate || ''))
    }), [recurrences, transactions, transfers])

  useEffect(() => {
    if (!awaitingPersistence) return
    if (persistence.status === 'error') {
      setError('A alteração recorrente foi revertida porque a gravação falhou. Revise o aviso de armazenamento antes de tentar novamente.')
      setFeedback(null)
      setAwaitingPersistence(null)
      setSawSaving(false)
      return
    }
    if (persistence.status === 'unsaved') {
      setFeedback({ type: 'info', text: 'O snapshot foi salvo, mas o espelho de compatibilidade ainda precisa de atenção.' })
      setAwaitingPersistence(null)
      setSawSaving(false)
      return
    }
    if (persistence.status === 'saving' || persistence.pendingChanges) {
      setSawSaving(true)
      return
    }
    if (sawSaving && persistence.status === 'synced') {
      setFeedback({ type: 'success', text: awaitingPersistence })
      setAwaitingPersistence(null)
      setSawSaving(false)
    }
  }, [awaitingPersistence, persistence.pendingChanges, persistence.status, sawSaving])

  const reset = () => {
    setForm(emptyForm())
    setEditing(null)
    setError('')
  }
  const setField = (event) => {
    const { name, value } = event.target
    setForm((current) => {
      if (name === 'type' && value !== current.type) {
        return {
          ...current,
          type: value,
          cardId: value === 'expense' ? current.cardId : '',
          sourceAccountId: value === 'transfer' ? current.sourceAccountId : '',
          destinationAccountId: value === 'transfer' ? current.destinationAccountId : '',
        }
      }
      if (name === 'paymentMethod' && value !== 'Crédito') return { ...current, paymentMethod: value, cardId: '' }
      return { ...current, [name]: value }
    })
  }
  const setAmount = (event) => {
    if (isMoneyInput(event.target.value)) setForm((current) => ({ ...current, amount: event.target.value }))
  }
  const showResult = (result, successText) => {
    if (result?.success === false) {
      setError(result.errors?.join(' ') || result.message || 'Não foi possível concluir a operação.')
      return false
    }
    setError('')
    if (result?.persistencePending) {
      setFeedback({ type: 'info', text: 'Alteração registrada. Confirmando a gravação no armazenamento…' })
      setAwaitingPersistence(successText)
      setSawSaving(false)
      return true
    }
    setFeedback({ type: 'success', text: successText })
    return true
  }
  const submit = (event) => {
    event.preventDefault()
    if (busy) return
    setError('')
    const amount = parseAmount(form.amount)
    if (!form.description.trim()) return setError('Informe uma descrição para a recorrência.')
    if (!Number.isFinite(amount) || amount <= 0) return setError('Informe um valor maior que zero.')
    if (!isDate(form.startDate)) return setError('Informe uma data inicial válida.')
    if (!Number.isInteger(Number(form.interval)) || Number(form.interval) < 1) return setError('O intervalo deve ser um número inteiro maior ou igual a 1.')
    if (form.endDate && (!isDate(form.endDate) || form.endDate < form.startDate)) return setError('A data final deve ser válida e não pode ser anterior à data inicial.')
    if (form.occurrenceLimit && (!Number.isInteger(Number(form.occurrenceLimit)) || Number(form.occurrenceLimit) < 1)) return setError('O limite de ocorrências deve ser um inteiro maior ou igual a 1.')
    if (form.type === 'transfer' && (!form.sourceAccountId || !form.destinationAccountId)) return setError('Selecione a conta de origem e a conta de destino.')
    if (form.type === 'transfer' && form.sourceAccountId === form.destinationAccountId) return setError('A conta de origem deve ser diferente da conta de destino.')
    if (form.type === 'expense' && form.paymentMethod === 'Crédito' && !form.cardId) return setError('Selecione o cartão para a despesa recorrente.')
    const draft = {
      type: form.type,
      frequency: form.frequency,
      interval: Number(form.interval),
      startDate: form.startDate,
      endDate: form.endDate || null,
      occurrenceLimit: form.occurrenceLimit ? Number(form.occurrenceLimit) : null,
      amount,
      description: form.description.trim(),
      category: form.type === 'transfer' ? '' : form.category || '',
      accountId: form.type === 'transfer' || form.cardId ? '' : form.accountId || '',
      paymentMethod: form.type === 'transfer' ? null : form.paymentMethod || null,
      cardId: form.type === 'expense' && form.paymentMethod === 'Crédito' ? form.cardId || null : null,
      sourceAccountId: form.type === 'transfer' ? form.sourceAccountId : null,
      destinationAccountId: form.type === 'transfer' ? form.destinationAccountId : null,
      generationMode: form.generationMode,
      advanceGenerationDays: Math.max(0, Number(form.advanceGenerationDays) || 0),
      reminderDaysBefore: form.reminderDaysBefore === '' ? null : Math.max(0, Number(form.reminderDaysBefore) || 0),
      notes: form.notes.trim(),
    }
    setBusy(true)
    const result = editing
      ? updateRecurrence?.(editing.recurrenceId, draft, { operationId: operationId(), effectiveFrom: form.effectiveFrom || undefined, scope: form.editScope })
      : createRecurrence?.(draft, { operationId: operationId() })
    const saved = showResult(result, editing ? 'Recorrência atualizada. As ocorrências já geradas foram preservadas.' : 'Recorrência criada. As próximas ocorrências serão geradas dentro da janela configurada.')
    if (saved) reset()
    setBusy(false)
  }
  const generate = () => {
    if (busy) return
    setBusy(true)
    const result = generateRecurrenceOccurrences?.({ operationId: operationId() })
    const generated = Number(result?.generatedCount ?? result?.generated ?? 0)
    const failures = Array.isArray(result?.failures) ? result.failures : []
    const failureText = failures.length ? ` ${failures.length} regra(s) precisavam de revisão: ${failures.map((failure) => failure.message).join(' ')}` : ''
    const successText = generated > 0
      ? `${generated} ocorrência(s) recorrente(s) foram geradas com segurança.${failureText}`
      : failures.length
        ? `A geração foi concluída parcialmente.${failureText}`
        : 'A geração foi executada. Não havia novas ocorrências dentro da janela configurada.'
    showResult(result, successText)
    setBusy(false)
  }
  const executeLifecycle = (action, recurrence) => {
    const actions = {
      pause: pauseRecurrence,
      resume: resumeRecurrence,
      complete: completeRecurrence,
      cancel: cancelRecurrence,
      delete: deleteRecurrence,
    }
    setBusy(true)
    const result = actions[action]?.(recurrence.recurrenceId, { operationId: operationId() })
    const messages = {
      pause: 'Recorrência pausada. Nenhuma nova ocorrência será criada enquanto estiver pausada.',
      resume: 'Recorrência retomada. A geração respeitará o período configurado.',
      complete: 'Recorrência concluída. O histórico gerado foi preservado.',
      cancel: 'Recorrência cancelada. O histórico gerado foi preservado.',
      delete: 'Recorrência sem ocorrências geradas foi excluída.',
    }
    showResult(result, messages[action])
    setPendingAction(null)
    setBusy(false)
  }
  const detachOccurrence = (occurrence) => {
    if (busy) return
    setBusy(true)
    const result = updateRecurrenceOccurrence?.(occurrence.occurrenceId, { detachedFromRecurrence: true }, { occurrenceType: occurrence.occurrenceType, operationId: operationId() })
    showResult(result, 'Ocorrência desvinculada. Ela permanece no histórico e não receberá futuras alterações da recorrência.')
    setPendingAction(null)
    setBusy(false)
  }
  const edit = (recurrence) => {
    setEditing(recurrence)
    setForm(formFromRecurrence(recurrence))
    setError('')
    setFeedback(null)
    document.getElementById('recurrence-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const recurrenceTypeLabel = (recurrence) => recurrence.type === 'transfer' ? 'Transferência' : recurrence.type === 'income' ? 'Receita' : 'Despesa'
  const recurrenceContext = (recurrence) => {
    if (recurrence.type === 'transfer') return `${accountLabel(accounts, recurrence.sourceAccountId)} → ${accountLabel(accounts, recurrence.destinationAccountId)}`
    if (recurrence.cardId) return `Cartão: ${cardLabel(cards, recurrence.cardId)}`
    if (recurrence.accountId) return `Conta: ${accountLabel(accounts, recurrence.accountId)}`
    return recurrence.paymentMethod || 'Sem conta definida'
  }

  return <section className="recurrences-section" aria-labelledby="recurrences-title">
    <div className="section-heading recurrence-heading">
      <div><p className="eyebrow">Planejamento recorrente</p><h2 id="recurrences-title">Recorrências</h2><p className="muted">A recorrência é uma regra. Ela gera lançamentos pendentes ou transferências agendadas, sem registrar pagamentos automaticamente.</p></div>
      <button type="button" className="outline-button" onClick={generate} disabled={busy || !recurrences.some((recurrence) => recurrence.status === 'active')}>Gerar ocorrências</button>
    </div>
    <form className="panel recurrence-form" onSubmit={submit} noValidate>
      <div className="recurrence-form-heading"><div><h3 id="recurrence-form-title">{editing ? 'Editar recorrência' : 'Nova recorrência'}</h3><p>{editing ? form.editScope === 'rule' ? 'Ocorrências já geradas serão preservadas; a alteração valerá na próxima geração segura.' : 'A alteração será aplicada somente às ocorrências pendentes e não desvinculadas dentro do escopo escolhido.' : 'Configure a regra e revise as três primeiras datas antes de salvar.'}</p></div></div>
      <fieldset className="form-grid form-section"><legend>Regra financeira</legend>
        <label>Tipo<select name="type" value={form.type} onChange={setField} disabled={busy}><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência interna</option></select></label>
        <label>Descrição<input required name="description" value={form.description} onChange={setField} placeholder="Ex.: Aluguel" disabled={busy} /></label>
        <label>Valor (R$)<input required inputMode="decimal" name="amount" value={form.amount} onChange={setAmount} placeholder="0,00" disabled={busy} /></label>
        <label>Frequência<select name="frequency" value={form.frequency} onChange={setField} disabled={busy}>{FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}</select></label>
        <label>Intervalo<input required min="1" step="1" type="number" name="interval" value={form.interval} onChange={setField} disabled={busy} /><small className="field-hint">Ex.: 2 para ocorrer a cada dois períodos.</small></label>
        <label>Data inicial<input required type="date" name="startDate" value={form.startDate} onChange={setField} disabled={busy} /></label>
        <label>Data final (opcional)<input type="date" name="endDate" value={form.endDate} onChange={setField} disabled={busy} /></label>
        <label>Limite de ocorrências (opcional)<input min="1" step="1" type="number" name="occurrenceLimit" value={form.occurrenceLimit} onChange={setField} disabled={busy} /></label>
        {form.type !== 'transfer' && <>
          <label>Categoria<select name="category" value={form.category} onChange={setField} disabled={busy}><option value="">Sem categoria</option>{categories.map((category) => <option value={category.id || category} key={category.id || category}>{category.name || category}</option>)}</select></label>
          <label>Forma de pagamento<select name="paymentMethod" value={form.paymentMethod} onChange={setField} disabled={busy}>{PAYMENT_METHODS.map((method) => <option value={method} key={method}>{method}</option>)}</select></label>
          {form.type === 'expense' && form.paymentMethod === 'Crédito' ? <label>Cartão<select name="cardId" value={form.cardId} onChange={setField} disabled={busy}><option value="">Selecione</option>{cards.map((card) => <option value={card.id} key={card.id}>{card.name}</option>)}</select><small className="field-hint">A compra usará a regra atual de faturas do cartão.</small></label> : <label>Conta financeira<select name="accountId" value={form.accountId} onChange={setField} disabled={busy}><option value="">Sem conta definida</option>{activeAccounts.map((account) => <option value={account.accountId} key={account.accountId} disabled={account.archived}>{account.name}{account.archived ? ' (arquivada)' : ''}</option>)}</select></label>}
        </>}
        {form.type === 'transfer' && <>
          <label>Conta de origem<select name="sourceAccountId" value={form.sourceAccountId} onChange={setField} disabled={busy}><option value="">Selecione</option>{activeAccounts.map((account) => <option value={account.accountId} key={account.accountId} disabled={account.archived}>{account.name}{account.archived ? ' (arquivada)' : ''}</option>)}</select></label>
          <label>Conta de destino<select name="destinationAccountId" value={form.destinationAccountId} onChange={setField} disabled={busy}><option value="">Selecione</option>{activeAccounts.map((account) => <option value={account.accountId} key={account.accountId} disabled={account.archived}>{account.name}{account.archived ? ' (arquivada)' : ''}</option>)}</select><small className="field-hint">A ocorrência será uma transferência agendada, nunca uma receita ou despesa.</small></label>
        </>}
      </fieldset>
      <details className="advanced-form recurrence-advanced"><summary>Geração e lembretes</summary><div className="form-grid">
        <label>Modo de geração<select name="generationMode" value={form.generationMode} onChange={setField} disabled={busy}><option value="automatic">Automática</option><option value="manual">Manual</option></select></label>
        <label>Gerar com antecedência (dias)<input min="0" max="365" step="1" type="number" name="advanceGenerationDays" value={form.advanceGenerationDays} onChange={setField} disabled={busy} /><small className="field-hint">Janela limitada para não criar um histórico excessivo.</small></label>
        <label>Dias para lembrar antes<input min="0" max="365" step="1" type="number" name="reminderDaysBefore" value={form.reminderDaysBefore} onChange={setField} disabled={busy} /></label>
        {editing && <><label>Escopo da alteração<select name="editScope" value={form.editScope} onChange={setField} disabled={busy}><option value="rule">Somente a regra (novas ocorrências)</option><option value="future">Esta data e ocorrências futuras pendentes</option><option value="all">Toda a série ainda não realizada</option></select></label>{form.editScope !== 'rule' && <label>Aplicar a partir de (opcional)<input type="date" name="effectiveFrom" value={form.effectiveFrom} onChange={setField} disabled={busy} /><small className="field-hint">Ocorrências realizadas ou desvinculadas nunca serão alteradas.</small></label>}</>}
        <label className="span-2">Observações<textarea rows="2" name="notes" value={form.notes} onChange={setField} placeholder="Opcional" disabled={busy} /></label>
      </div></details>
      <aside className="recurrence-preview" aria-live="polite"><strong>Prévia das próximas datas</strong>{previews.length ? <ol>{previews.map((date) => <li key={date}>{safeFormatDate(date)}</li>)}</ol> : <span>Informe uma data inicial e limites válidos para ver a prévia.</span>}<small>Datas mensais preservam o dia original quando possível; dias 29, 30 e 31 são ajustados apenas nos meses mais curtos.</small></aside>
      {error && <p className="form-error" role="alert">{error}</p>}
      {feedback && <p className={`recurrence-feedback ${feedback.type}`} role="status">{feedback.text}</p>}
      {persistence.status === 'error' && <p className="form-error" role="alert">A alteração local foi revertida porque não foi confirmada no armazenamento.</p>}
      <div className="form-actions">{editing && <button type="button" className="text-button" onClick={reset} disabled={busy}>Cancelar edição</button>}<button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar recorrência' : 'Criar recorrência'}</button></div>
    </form>
    <div className="recurrence-history" aria-live="polite">
      <div className="recurrence-history-heading"><div><p className="eyebrow">Regras cadastradas</p><h3>{recurrenceRows.length ? `${recurrenceRows.length} recorrência${recurrenceRows.length === 1 ? '' : 's'}` : 'Nenhuma recorrência cadastrada'}</h3></div></div>
      {!recurrenceRows.length ? <div className="recurrence-empty"><strong>Planeje entradas, despesas e transferências previsíveis.</strong><span>As ocorrências permanecem pendentes ou agendadas até que você as confirme manualmente.</span></div> : <ul className="recurrence-list">{recurrenceRows.map(({ recurrence, occurrences }) => {
        const canDelete = occurrences.length === 0
        const isExpanded = showOccurrencesFor === recurrence.recurrenceId
        return <li className={`recurrence-item ${recurrence.status || 'active'}`} key={recurrence.recurrenceId}>
          <div className="recurrence-item-main">
            <div className="recurrence-title"><strong>{recurrence.description}</strong><span className={`recurrence-status ${recurrence.status || 'active'}`}>{recurrenceStatuses[recurrence.status] || recurrence.status}</span><span className="recurrence-type">{recurrenceTypeLabel(recurrence)}</span></div>
            <p>{formatCurrency(recurrence.amount)} · {FREQUENCIES.find((frequency) => frequency.value === recurrence.frequency)?.label || recurrence.frequency} {Number(recurrence.interval) > 1 ? `a cada ${recurrence.interval}` : ''}</p>
            <small>{recurrenceContext(recurrence)} · Próxima: {safeFormatDate(recurrence.nextOccurrenceDate)} · {occurrences.length} ocorrência(s) gerada(s)</small>
            {recurrence.endDate && <small>Termina em {safeFormatDate(recurrence.endDate)}</small>}
          </div>
          <div className="recurrence-item-actions">
            <button type="button" className="text-button" onClick={() => edit(recurrence)} disabled={busy}>Editar</button>
            {recurrence.status === 'active' && <button type="button" className="outline-button" onClick={() => setPendingAction({ type: 'pause', recurrence })} disabled={busy}>Pausar</button>}
            {recurrence.status === 'paused' && <button type="button" className="outline-button" onClick={() => setPendingAction({ type: 'resume', recurrence })} disabled={busy}>Retomar</button>}
            {['active', 'paused'].includes(recurrence.status) && <button type="button" className="text-button" onClick={() => setPendingAction({ type: 'complete', recurrence })} disabled={busy}>Concluir</button>}
            {['active', 'paused'].includes(recurrence.status) && <button type="button" className="text-button" onClick={() => setPendingAction({ type: 'cancel', recurrence })} disabled={busy}>Cancelar</button>}
            {canDelete && <button type="button" className="text-button recurrence-delete" onClick={() => setPendingAction({ type: 'delete', recurrence })} disabled={busy}>Excluir</button>}
            {occurrences.length > 0 && <button type="button" className="text-button" aria-expanded={isExpanded} onClick={() => setShowOccurrencesFor(isExpanded ? null : recurrence.recurrenceId)}>{isExpanded ? 'Ocultar ocorrências' : `Ver ocorrências (${occurrences.length})`}</button>}
          </div>
          {isExpanded && <ul className="recurrence-occurrence-list" aria-label={`Ocorrências de ${recurrence.description}`}>{occurrences.map((occurrence) => <li key={`${occurrence.occurrenceType}-${occurrence.occurrenceId}`}><span><b>{safeFormatDate(occurrence.date)}</b>{occurrence.description ? ` · ${occurrence.description}` : ''}</span><span>{formatCurrency(occurrence.amount)} · {occurrence.occurrenceType === 'transfer' ? 'Transferência agendada' : occurrence.status === 'received' ? 'Recebida' : occurrence.status === 'paid' ? 'Paga' : 'Pendente'}{occurrence.detached ? ' · Desvinculada' : ''}</span>{!occurrence.detached && <button type="button" className="text-button" disabled={busy} onClick={() => setPendingAction({ type: 'detach', occurrence })}>Desvincular</button>}</li>)}</ul>}
        </li>
      })}</ul>}
    </div>
    <ConfirmDialog
      open={Boolean(pendingAction)}
      title={pendingAction?.type === 'detach' ? 'Desvincular ocorrência' : pendingAction?.type === 'delete' ? 'Excluir recorrência' : `${{ pause: 'Pausar', resume: 'Retomar', complete: 'Concluir', cancel: 'Cancelar' }[pendingAction?.type] || 'Alterar'} recorrência`}
      description={pendingAction?.type === 'detach'
        ? 'A ocorrência continuará no histórico, mas não receberá alterações futuras da regra recorrente.'
        : pendingAction?.type === 'cancel'
          ? 'As ocorrências futuras ainda pendentes serão canceladas; ocorrências realizadas, personalizadas e o histórico já gerado serão preservados.'
          : pendingAction?.type === 'delete'
          ? 'A exclusão só é permitida para recorrências sem ocorrência gerada.'
          : 'O histórico já gerado será preservado. Esta ação altera apenas a geração de novas ocorrências.'}
      confirmLabel={pendingAction?.type === 'detach' ? 'Desvincular ocorrência' : pendingAction?.type === 'delete' ? 'Excluir recorrência' : 'Confirmar'}
      danger={['cancel', 'delete'].includes(pendingAction?.type)}
      critical={['cancel', 'delete', 'detach'].includes(pendingAction?.type)}
      loading={busy}
      onCancel={() => !busy && setPendingAction(null)}
      onConfirm={() => pendingAction?.type === 'detach' ? detachOccurrence(pendingAction.occurrence) : executeLifecycle(pendingAction?.type, pendingAction?.recurrence)}
    />
  </section>
}
