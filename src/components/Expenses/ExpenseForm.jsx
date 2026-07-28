import { useEffect, useRef, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { accounts as legacyAccounts, costCenters, necessities, paymentMethods } from '../../data/settings'
import { getInvoicePeriod } from '../../utils/invoiceCalculations'
import ReopenInvoiceModal from '../Invoices/ReopenInvoiceModal'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ description: '', amount: '', type: 'expense', category: '', costCenter: 'Pessoal', account: 'Saldo em Conta', accountId: '', paymentMethod: 'Pix', cardId: '', date: today(), dueDate: today(), status: 'pending', necessity: 'essential', installmentNumber: 1, installmentTotal: 1, installmentValueType: 'installment', invoiceMonth: '', invoiceYear: '', notes: '' })
const parseAmount = (value) => Number(String(value).replace(',', '.'))

export default function ExpenseForm({ editing, onFinish }) {
  const { categories, cards, accounts, addTransaction, updateTransaction } = useFinance()
  const [form, setForm] = useState(emptyForm); const [error, setError] = useState(''); const [conflict, setConflict] = useState(null); const submittingRef = useRef(false); const [submitting, setSubmitting] = useState(false); const descriptionRef = useRef(null); const amountRef = useRef(null); const cardRef = useRef(null)
  const isCardPurchase = Boolean(form.cardId) || (form.type === 'expense' && form.paymentMethod === 'Crédito')
  useEffect(() => { if (editing) setForm({ ...editing, accountId: editing.cardId ? '' : editing.accountId || '', installmentValueType: 'installment', editScope: 'single', recalculateInvoice: false, temporalMode: editing.invoiceAssignmentMode === 'automatic' ? 'recalculate' : 'keep' }) }, [editing])
  useEffect(() => { if (!form.category && categories.length) setForm((value) => ({ ...value, category: categories[0] })) }, [categories, form.category])
  useEffect(() => { if (isCardPurchase && !form.cardId) setForm((value) => ({ ...value, cardId: cards[0]?.id || '' })) }, [isCardPurchase, form.cardId, cards])
  useEffect(() => { if (isCardPurchase && form.accountId) setForm((value) => ({ ...value, accountId: '' })) }, [isCardPurchase, form.accountId])
  useEffect(() => { if (!isCardPurchase || editing || !form.date || !form.cardId) return; const card = cards.find((item) => item.id === form.cardId); if (card) { const period = getInvoicePeriod(form.date, card); setForm((value) => ({ ...value, invoiceMonth: period.invoiceMonth, invoiceYear: period.invoiceYear })) } }, [isCardPurchase, editing, form.date, form.cardId, cards])
  const set = (event) => setForm((value) => ({ ...value, [event.target.name]: event.target.value }))
  const setAmount = (event) => { const value = event.target.value; if (/^\d*[.,]?\d{0,2}$/.test(value)) setForm((current) => ({ ...current, amount: value })) }
  const submit = (event) => {
    event.preventDefault(); if (submittingRef.current) return
    if (!form.description.trim()) { setError('Informe a descrição.'); descriptionRef.current?.focus(); return }
    if (parseAmount(form.amount) <= 0) { setError('Informe um valor maior que zero.'); amountRef.current?.focus(); return }
    if (isCardPurchase && !form.cardId) { setError('Selecione o cartão da compra.'); cardRef.current?.focus(); return }
    if (isCardPurchase && (Number(form.installmentNumber) < 1 || Number(form.installmentTotal) < Number(form.installmentNumber))) { setError('A parcela atual deve estar entre 1 e o total de parcelas.'); return }
    submittingRef.current = true; setSubmitting(true)
    const operationId = editing ? editing.operationId : (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`)
    const normalized = { ...form, accountId: isCardPurchase ? '' : form.accountId || '', amount: parseAmount(form.amount), description: form.description.trim(), notes: form.notes.trim(), operationId, source: form.source || 'manual' }
    if (editing) {
      const result = updateTransaction(editing.id, normalized)
      if (!result?.success) { setError(result?.message || 'N\u00e3o foi poss\u00edvel atualizar o lan\u00e7amento.'); submittingRef.current = false; setSubmitting(false); return }
    } else {
      const result = addTransaction(normalized)
      if (result?.requiresReopen) { setConflict(result); return }
      if (!result?.success) { setError(result?.message || 'N\u00e3o foi poss\u00edvel adicionar o lan\u00e7amento.'); submittingRef.current = false; setSubmitting(false); return }
    }
    setForm(emptyForm()); setError(''); onFinish?.(); window.setTimeout(() => { submittingRef.current = false; setSubmitting(false) }, 0)
  }
  return <form className="panel transaction-form" onSubmit={submit} noValidate>
    <div className="section-heading"><div><p className="eyebrow">Novo registro</p><h2>{editing ? 'Editar lançamento' : 'Adicionar lançamento'}</h2></div></div>
    <div className="type-switch" role="group" aria-label="Tipo do lançamento"><button type="button" aria-pressed={form.type === 'expense'} className={form.type === 'expense' ? 'active expense' : ''} onClick={() => setForm({ ...form, type: 'expense' })}>Despesa</button><button type="button" aria-pressed={form.type === 'income'} className={form.type === 'income' ? 'active income' : ''} onClick={() => setForm({ ...form, type: 'income', cardId: '' })}>Receita</button></div>
    <fieldset className="form-grid form-section"><legend>Básico</legend>
      <label className="span-2">Descrição<input ref={descriptionRef} required name="description" value={form.description} onChange={set} placeholder="Ex.: Compras do mês" aria-describedby={error && !form.description.trim() ? 'transaction-error' : undefined} /></label>
      <label>{isCardPurchase && form.installmentValueType === 'installment' ? 'Valor da parcela (R$)' : 'Valor total (R$)'}<input ref={amountRef} required inputMode="decimal" name="amount" value={form.amount} onChange={setAmount} placeholder="0,00" aria-describedby={error && parseAmount(form.amount) <= 0 ? 'transaction-error' : undefined} /></label>
      <label>Data da compra<input type="date" name="date" value={form.date} onChange={set} /></label><label>Categoria<select name="category" value={form.category} onChange={set}>{categories.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Forma de pagamento<select name="paymentMethod" value={form.paymentMethod} onChange={set} disabled={Boolean(editing?.cardId)}>{paymentMethods.map((x) => <option key={x}>{x}</option>)}</select></label>
      {isCardPurchase ? <label>Cartão<select ref={cardRef} name="cardId" value={form.cardId} onChange={set} disabled={Boolean(editing?.cardId)}>{cards.map((card) => <option value={card.id} key={card.id}>{card.name}</option>)}</select></label> : <><label>Conta/forma de pagamento<select name="account" value={form.account} onChange={set}>{legacyAccounts.filter((account) => !cards.some((card) => card.name === account)).map((x) => <option key={x}>{x}</option>)}</select></label><label>Conta financeira<select name="accountId" value={form.accountId} onChange={set}><option value="">Sem conta definida</option>{accounts.filter((account) => !account.archived || account.accountId === form.accountId).map((account) => <option value={account.accountId} key={account.accountId}>{account.name}{account.archived ? ' (arquivada)' : ''}</option>)}</select></label><label>Vencimento<input type="date" name="dueDate" value={form.dueDate} onChange={set} /></label><label>Status<select name="status" value={form.status} onChange={set}><option value="pending">Pendente</option><option value="paid">Pago</option></select></label></>}
    </fieldset>
    <details className="advanced-form" open={isCardPurchase || Boolean(editing)}><summary>Classificação e opções avançadas</summary><div className="form-grid">
      <label>Centro de custo<select name="costCenter" value={form.costCenter} onChange={set}>{costCenters.map((x) => <option key={x}>{x}</option>)}</select></label><label>Classificação<select name="necessity" value={form.necessity} onChange={set}>{necessities.map((x) => <option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
      {isCardPurchase && !editing && <><label>Parcela atual<input type="number" min="1" max="48" name="installmentNumber" value={form.installmentNumber} onChange={set} /></label><label>Total de parcelas<input type="number" min="1" max="48" name="installmentTotal" value={form.installmentTotal} onChange={set} /></label><label>O valor informado é<select name="installmentValueType" value={form.installmentValueType} onChange={set}><option value="installment">Valor de cada parcela</option><option value="total">Valor total da compra</option></select></label><label>Mês da parcela atual<select name="invoiceMonth" value={form.invoiceMonth} onChange={set}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, index, 1))}</option>)}</select></label><label>Ano da parcela atual<input type="number" min="2000" max="2200" name="invoiceYear" value={form.invoiceYear} onChange={set} /></label></>}
      {editing?.cardId && <label>Parcela<input value={form.installment || `${form.installmentNumber}/${form.installmentTotal}`} disabled /></label>}{editing?.installmentGroupId && Number(editing.installmentTotal) > 1 && <label>Aplicar alterações<select name="editScope" value={form.editScope || 'single'} onChange={set}><option value="single">Somente esta parcela</option><option value="future">Esta e as próximas</option></select></label>}{editing?.cardId && editing.date !== form.date && <label>Data e fatura<select name="temporalMode" value={form.temporalMode || 'keep'} onChange={set}><option value="recalculate">Recalcular fatura</option><option value="keep">Manter fatura atual (manual)</option></select></label>}{editing?.invoiceAssignmentMode === 'legacy-fixed' && <label className="recalculate-option"><input type="checkbox" name="recalculateInvoice" checked={Boolean(form.recalculateInvoice)} onChange={(event) => setForm((value) => ({ ...value, recalculateInvoice: event.target.checked }))} />Recalcular fatura automaticamente</label>}
      <label className="span-2">Observações<textarea name="notes" value={form.notes} onChange={set} rows="2" placeholder="Informações opcionais" /></label>
    </div></details>
    {isCardPurchase && !editing && <aside className="transaction-preview" aria-live="polite"><strong>Prévia da compra</strong><span>Parcela {form.installmentNumber}/{form.installmentTotal} · competência {String(form.invoiceMonth).padStart(2, '0')}/{form.invoiceYear} · {cards.find((card) => card.id === form.cardId)?.name}</span><small>A parcela atual será mantida nesta fatura e somente as posteriores serão projetadas.</small></aside>}
    {error && <p id="transaction-error" className="form-error" role="alert">{error}</p>}
    <div className="form-actions">{editing && <button className="text-button" type="button" onClick={onFinish}>Cancelar</button>}<button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar lançamento'}</button></div>
    {conflict && <ReopenInvoiceModal conflict={conflict} onClose={() => { setConflict(null); submittingRef.current = false; setSubmitting(false) }} onChooseAnother={() => { setConflict(null); submittingRef.current = false; setSubmitting(false) }} onConfirm={() => { addTransaction(conflict.transaction, { reopenPaidInvoice: true }); setConflict(null); setForm(emptyForm()); setError(''); submittingRef.current = false; setSubmitting(false); onFinish?.() }} />}
  </form>
}
