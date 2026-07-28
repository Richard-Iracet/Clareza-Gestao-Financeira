import { useEffect, useMemo, useRef, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { getAccountProjectedBalance, getAccountRealizedBalance } from '../../domain/accounts/accountSelectors'
import { formatCurrency } from '../../utils/currency'

const localToday = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const operationId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const emptyForm = () => ({ sourceAccountId: '', destinationAccountId: '', amount: '', date: localToday(), status: 'completed', fee: '0', description: '', notes: '' })
const parseAmount = (value) => Number(String(value || '').replace(',', '.'))
const moneyInput = (value) => /^\d*[.,]?\d{0,2}$/.test(value)

const formFromTransfer = (transfer) => ({
  sourceAccountId: transfer.sourceAccountId || '',
  destinationAccountId: transfer.destinationAccountId || '',
  amount: String(transfer.amount ?? ''),
  date: transfer.date || localToday(),
  status: transfer.status || 'scheduled',
  fee: String(transfer.fee ?? 0),
  description: transfer.description || '',
  notes: transfer.notes || '',
})

export default function TransferForm({ editing, onFinish }) {
  const { accounts, transactions, transfers, invoicePayments, addTransfer, updateScheduledTransfer, persistence } = useFinance()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [awaitingPersistence, setAwaitingPersistence] = useState(null)
  const [sawSaving, setSawSaving] = useState(false)
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const sourceRef = useRef(null)
  const destinationRef = useRef(null)
  const amountRef = useRef(null)
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived || account.accountId === form.sourceAccountId || account.accountId === form.destinationAccountId), [accounts, form.destinationAccountId, form.sourceAccountId])
  const source = accounts.find((account) => account.accountId === form.sourceAccountId)
  const destination = accounts.find((account) => account.accountId === form.destinationAccountId)
  const amount = parseAmount(form.amount)
  const fee = parseAmount(form.fee)
  const sourceRealized = source ? getAccountRealizedBalance(source, transactions, invoicePayments, new Date(), transfers) : 0
  const sourceProjected = source ? getAccountProjectedBalance(source, transactions, invoicePayments, new Date(), transfers) : 0
  const debit = Number.isFinite(amount) && amount > 0 ? amount + (Number.isFinite(fee) ? fee : 0) : 0
  const sourceAfter = form.status === 'scheduled' ? sourceProjected - debit : sourceRealized - debit

  useEffect(() => {
    if (!editing) {
      setForm(emptyForm())
      setError('')
      return
    }
    setForm(formFromTransfer(editing))
    setError('')
    setFeedback(null)
  }, [editing])

  useEffect(() => {
    if (!awaitingPersistence) return
    if (persistence.status === 'error') {
      setError('A alteração foi revertida porque a gravação falhou. Use o aviso de armazenamento para tentar novamente ou exportar um backup.')
      setFeedback(null)
      setAwaitingPersistence(null)
      submittingRef.current = false
      setSubmitting(false)
      return
    }
    if (persistence.status === 'unsaved') {
      setFeedback({ type: 'info', text: 'A transferência foi registrada no snapshot, mas o espelho de compatibilidade ainda precisa de atenção.' })
      setAwaitingPersistence(null)
      submittingRef.current = false
      setSubmitting(false)
      return
    }
    if (persistence.status === 'saving' || persistence.pendingChanges) {
      setSawSaving(true)
      return
    }
    if (sawSaving && persistence.status === 'synced' && !persistence.pendingChanges) {
      setFeedback({ type: 'success', text: awaitingPersistence.message })
      setAwaitingPersistence(null)
      setSawSaving(false)
      setForm(emptyForm())
      submittingRef.current = false
      setSubmitting(false)
      onFinish?.()
    }
  }, [awaitingPersistence, onFinish, persistence.pendingChanges, persistence.status, sawSaving])

  const set = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const setMoney = (field, event) => {
    const value = event.target.value
    if (moneyInput(value)) setForm((current) => ({ ...current, [field]: value }))
  }
  const cancelEdit = () => {
    if (submitting) return
    setForm(emptyForm())
    setError('')
    setFeedback(null)
    onFinish?.()
  }
  const submit = (event) => {
    event.preventDefault()
    if (submittingRef.current) return
    setError('')
    if (!form.sourceAccountId) {
      setError('Selecione a conta de origem.')
      sourceRef.current?.focus()
      return
    }
    if (!form.destinationAccountId) {
      setError('Selecione a conta de destino.')
      destinationRef.current?.focus()
      return
    }
    if (form.sourceAccountId === form.destinationAccountId) {
      setError('A conta de origem deve ser diferente da conta de destino.')
      destinationRef.current?.focus()
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Informe um valor maior que zero.')
      amountRef.current?.focus()
      return
    }
    if (!Number.isFinite(fee) || fee < 0 || fee !== 0) {
      setError('Taxas diferentes de R$ 0,00 ainda não são suportadas com segurança nesta fase.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Informe uma data válida.')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    const draft = {
      sourceAccountId: form.sourceAccountId,
      destinationAccountId: form.destinationAccountId,
      amount,
      date: form.date,
      status: form.status,
      fee,
      description: form.description.trim(),
      notes: form.notes.trim(),
    }
    const result = editing
      ? updateScheduledTransfer(editing.transferId, draft, { operationId: operationId() })
      : addTransfer(draft, { operationId: operationId() })
    if (!result?.success) {
      setError(result?.errors?.join(' ') || result?.message || 'Não foi possível registrar a transferência.')
      submittingRef.current = false
      setSubmitting(false)
      return
    }
    setFeedback({ type: 'info', text: 'Transferência registrada. Confirmando a gravação no armazenamento…' })
    setAwaitingPersistence({ message: editing ? 'Transferência agendada atualizada e salva.' : 'Transferência salva com sucesso.' })
    setSawSaving(false)
  }

  return <form className="panel transfer-form" onSubmit={submit} noValidate>
    <div className="section-heading"><div><p className="eyebrow">Movimentação interna</p><h2>{editing ? 'Editar transferência agendada' : 'Transferir entre contas'}</h2><p className="muted">Transferências não são receitas, despesas ou categorias de consumo.</p></div></div>
    {accounts.filter((account) => !account.archived).length < 2 && <p className="form-error" role="alert">Cadastre pelo menos duas contas financeiras ativas para criar uma transferência.</p>}
    <fieldset className="form-grid form-section">
      <legend>Dados da transferência</legend>
      <label>Conta de origem<select ref={sourceRef} required name="sourceAccountId" value={form.sourceAccountId} onChange={set} disabled={submitting}><option value="">Selecione</option>{activeAccounts.map((account) => <option key={account.accountId} value={account.accountId} disabled={account.archived}>{account.name}{account.archived ? ' (arquivada)' : ''}</option>)}</select></label>
      <label>Conta de destino<select ref={destinationRef} required name="destinationAccountId" value={form.destinationAccountId} onChange={set} disabled={submitting}><option value="">Selecione</option>{activeAccounts.map((account) => <option key={account.accountId} value={account.accountId} disabled={account.archived}>{account.name}{account.archived ? ' (arquivada)' : ''}</option>)}</select></label>
      <label>Valor (R$)<input ref={amountRef} required inputMode="decimal" name="amount" value={form.amount} onChange={(event) => setMoney('amount', event)} placeholder="0,00" disabled={submitting} /></label>
      <label>Data<input required type="date" name="date" value={form.date} onChange={set} disabled={submitting} /></label>
      <label>Status<select name="status" value={form.status} onChange={set} disabled={Boolean(editing) || submitting}><option value="completed">Concluída</option><option value="scheduled">Agendada</option></select></label>
      <label>Taxa opcional (R$)<input inputMode="decimal" name="fee" value={form.fee} onChange={(event) => setMoney('fee', event)} disabled={submitting} /><small className="field-hint">Nesta fase, a taxa deve ser R$ 0,00 para não criar uma despesa financeira sem classificação segura.</small></label>
      <label className="span-2">Descrição<input name="description" value={form.description} onChange={set} placeholder="Opcional" disabled={submitting} /></label>
      <label className="span-2">Observações<textarea name="notes" value={form.notes} onChange={set} rows="2" placeholder="Opcional" disabled={submitting} /></label>
    </fieldset>
    {source && <aside className="transfer-preview" aria-live="polite"><strong>Prévia da conta de origem</strong><span>Saldo realizado atual: {formatCurrency(sourceRealized)} · saldo projetado atual: {formatCurrency(sourceProjected)}</span><span>Após a transferência {form.status === 'scheduled' ? 'agendada' : 'concluída'}: {formatCurrency(sourceAfter)}</span>{sourceAfter < 0 && <small className="critical-warning">A transferência deixará a conta com saldo negativo. O sistema permite continuar, conforme a regra atual.</small>}</aside>}
    {destination && <p className="transfer-destination-note" aria-live="polite">Destino: <strong>{destination.name}</strong> receberá {formatCurrency(Number.isFinite(amount) ? amount : 0)}.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {feedback && <p className={feedback.type === 'success' ? 'success-message' : 'transfer-feedback'} role="status">{feedback.text}</p>}
    <div className="form-actions">{editing && <button className="text-button" type="button" onClick={cancelEdit} disabled={submitting}>Cancelar edição</button>}<button className="primary-button" type="submit" disabled={submitting || accounts.filter((account) => !account.archived).length < 2}>{submitting ? 'Confirmando…' : editing ? 'Salvar transferência' : 'Registrar transferência'}</button></div>
  </form>
}
