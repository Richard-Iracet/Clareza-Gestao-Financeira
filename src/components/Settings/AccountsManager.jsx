import { useMemo, useState } from 'react'
import ConfirmDialog from '../Common/ConfirmDialog'
import { useFinance } from '../../context/FinanceContext'
import { ACCOUNT_TYPES } from '../../domain/accounts/accountService'
import { getAccountMovements, getAccountProjectedBalance, getAccountRealizedBalance } from '../../domain/accounts/accountSelectors'
import { formatCurrency } from '../../utils/currency'

const accountTypeLabels = {
  checking: 'Conta corrente',
  digital: 'Conta digital',
  savings: 'Poupança',
  cash: 'Dinheiro',
  investment: 'Investimento',
  other: 'Outra',
}
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const operationId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const emptyForm = () => ({ name: '', institution: '', type: 'checking', initialBalance: '0', initialBalanceDate: today(), includeInTotalBalance: true, notes: '' })
const formFromAccount = (account) => ({
  name: account.name || '',
  institution: account.institution || '',
  type: account.type || 'checking',
  initialBalance: String(account.initialBalance ?? 0),
  initialBalanceDate: account.initialBalanceDate || today(),
  includeInTotalBalance: account.includeInTotalBalance !== false,
  notes: account.notes || '',
})

export default function AccountsManager() {
  const { accounts, transactions, transfers, invoicePayments, addAccount, updateAccount, archiveAccount, restoreAccount, deleteAccount } = useFinance()
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [pendingInitialChange, setPendingInitialChange] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const accountRows = useMemo(() => accounts
    .map((account) => ({
      account,
      movements: getAccountMovements(transactions, invoicePayments, account.accountId, { transfers }),
      realized: getAccountRealizedBalance(account, transactions, invoicePayments, new Date(), transfers),
      projected: getAccountProjectedBalance(account, transactions, invoicePayments, new Date(), transfers),
    }))
    .sort((left, right) => Number(left.account.archived) - Number(right.account.archived) || left.account.name.localeCompare(right.account.name, 'pt-BR')), [accounts, transactions, transfers, invoicePayments])

  const reset = () => {
    setForm(emptyForm())
    setEditingId(null)
  }
  const showResult = (result, successText) => {
    if (result.success) {
      setFeedback({ type: 'success', text: successText })
      reset()
      return true
    }
    setFeedback({ type: 'error', text: result.errors?.join(' ') || result.message || 'Não foi possível concluir a operação.' })
    return false
  }
  const submit = (event) => {
    event.preventDefault()
    const draft = { ...form, initialBalance: Number(form.initialBalance) }
    if (!editingId) {
      showResult(addAccount(draft, { operationId: operationId() }), 'Conta criada com sucesso.')
      return
    }
    const id = operationId()
    const result = updateAccount(editingId, draft, { operationId: id })
    if (result.requiresConfirmation) {
      const previous = accounts.find((account) => account.accountId === editingId)
      setPendingInitialChange({ accountId: editingId, draft, operationId: id, previous, next: result.account })
      return
    }
    showResult(result, 'Conta atualizada com sucesso.')
  }
  const confirmInitialChange = () => {
    const pending = pendingInitialChange
    if (!pending) return
    const result = updateAccount(pending.accountId, pending.draft, { operationId: pending.operationId, confirmInitialBalanceChange: true })
    if (showResult(result, 'Saldo inicial da conta atualizado com confirmação.')) setPendingInitialChange(null)
  }
  const changeLifecycle = (account, action) => {
    const result = action === 'archive'
      ? archiveAccount(account.accountId, { operationId: operationId() })
      : restoreAccount(account.accountId, { operationId: operationId() })
    if (result.success) setFeedback({ type: 'success', text: action === 'archive' ? 'Conta arquivada. O histórico foi preservado.' : 'Conta restaurada.' })
    else setFeedback({ type: 'error', text: result.message || 'Não foi possível alterar o status da conta.' })
  }
  const confirmDelete = () => {
    if (!deleting) return
    const result = deleteAccount(deleting.account.accountId, { operationId: operationId() })
    if (result.success) {
      setFeedback({ type: 'success', text: 'Conta sem movimentações excluída com segurança.' })
      if (editingId === deleting.account.accountId) reset()
      setDeleting(null)
      return
    }
    setFeedback({ type: 'error', text: result.errorCode === 'ACCOUNT_HAS_MOVEMENTS' ? 'Esta conta possui movimentações e não pode ser excluída.' : 'Não foi possível excluir a conta.' })
    setDeleting(null)
  }
  const initialImpact = pendingInitialChange ? Number(pendingInitialChange.next.initialBalance) - Number(pendingInitialChange.previous.initialBalance) : 0

  return (
    <article className="settings-card accounts-manager">
      <div className="settings-icon" aria-hidden="true">◎</div>
      <h3>Contas financeiras</h3>
      <p>Cadastre contas bancárias, dinheiro ou investimentos. Cartões de crédito continuam separados e não alteram saldo bancário na compra.</p>
      <form className="account-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="span-2">Nome da conta<input required name="name" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="Ex.: Conta principal" /></label>
          <label>Instituição<input name="institution" value={form.institution} onChange={(event) => setForm((value) => ({ ...value, institution: event.target.value }))} placeholder="Opcional" /></label>
          <label>Tipo<select name="type" value={form.type} onChange={(event) => setForm((value) => ({ ...value, type: event.target.value }))}>{ACCOUNT_TYPES.map((type) => <option value={type} key={type}>{accountTypeLabels[type]}</option>)}</select></label>
          <label>Saldo inicial<input required type="number" step="0.01" name="initialBalance" value={form.initialBalance} onChange={(event) => setForm((value) => ({ ...value, initialBalance: event.target.value }))} /></label>
          <label>Data-base do saldo<input required type="date" name="initialBalanceDate" value={form.initialBalanceDate} onChange={(event) => setForm((value) => ({ ...value, initialBalanceDate: event.target.value }))} /></label>
          <label className="account-total-toggle"><input type="checkbox" checked={form.includeInTotalBalance} onChange={(event) => setForm((value) => ({ ...value, includeInTotalBalance: event.target.checked }))} /> Incluir no saldo consolidado</label>
          <label className="span-2">Observações<textarea name="notes" rows="2" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} placeholder="Opcional" /></label>
        </div>
        <div className="settings-actions">
          {editingId && <button type="button" className="text-button" onClick={reset}>Cancelar edição</button>}
          <button type="submit" className="primary-button">{editingId ? 'Salvar conta' : 'Adicionar conta'}</button>
        </div>
      </form>
      {feedback && <div className={`settings-feedback ${feedback.type}`} role="status">{feedback.text}</div>}
      <div className="account-list" aria-label="Contas cadastradas">
        {accountRows.length === 0 && <p className="muted">Nenhuma conta cadastrada. Lançamentos antigos permanecem em “Sem conta definida”.</p>}
        {accountRows.map(({ account, movements, realized, projected }) => (
          <section className={`account-row ${account.archived ? 'archived' : ''}`} key={account.accountId}>
            <div className="account-row-heading">
              <div><strong>{account.name}</strong><span>{accountTypeLabels[account.type]}{account.institution ? ` · ${account.institution}` : ''}{account.archived ? ' · Arquivada' : ''}</span></div>
              <div className="account-balance"><span>Realizado <b>{formatCurrency(realized)}</b></span><span>Projetado <b>{formatCurrency(projected)}</b></span></div>
            </div>
            <p className="account-meta">Saldo inicial {formatCurrency(account.initialBalance)} em {account.initialBalanceDate} · {account.includeInTotalBalance ? 'incluída no consolidado' : 'fora do consolidado'} · {movements.length} movimentação(ões)</p>
            {account.notes && <p className="account-notes">{account.notes}</p>}
            {movements.length > 0 && <details className="account-movements"><summary>Ver movimentações ({movements.length})</summary><ul>{movements.slice(0, 10).map((movement, index) => {
              const isTransfer = movement.movementType === 'transfer'
              const incoming = isTransfer ? movement.direction === 'in' : movement.type === 'income'
              const counterparty = isTransfer ? accounts.find((candidate) => candidate.accountId === movement.counterpartyAccountId)?.name : null
              const description = movement.description || (isTransfer ? `Transferência ${incoming ? 'de' : 'para'} ${counterparty || 'conta financeira'}` : `Pagamento de fatura ${movement.invoiceId || ''}`)
              return <li key={movement.id || movement.paymentId || `${movement.invoiceId}-${index}`}><span>{description}</span><b className={incoming ? 'income' : 'expense'}>{incoming ? '+' : '−'} {formatCurrency(movement.amount)}</b><small>{movement.paymentDate || movement.date || movement.paidAt?.slice(0, 10)}</small></li>
            })}</ul></details>}
            <div className="account-row-actions">
              <button type="button" className="text-button" onClick={() => { setEditingId(account.accountId); setForm(formFromAccount(account)); setFeedback(null) }}>Editar</button>
              {account.archived ? <button type="button" className="outline-button" onClick={() => changeLifecycle(account, 'restore')}>Restaurar</button> : <button type="button" className="outline-button" onClick={() => changeLifecycle(account, 'archive')}>Arquivar</button>}
              <button type="button" className="text-button" disabled={movements.length > 0} title={movements.length > 0 ? 'Contas com movimentações preservam o histórico e não podem ser excluídas.' : 'Excluir conta sem movimentações'} onClick={() => setDeleting({ account, movements })}>Excluir</button>
            </div>
          </section>
        ))}
      </div>
      <ConfirmDialog open={Boolean(pendingInitialChange)} title="Confirmar alteração do saldo inicial" description="A alteração não cria receita ou despesa; ela altera apenas a base de cálculo desta conta." impact={pendingInitialChange && <dl className="compact-stats"><div><dt>Variação da base</dt><dd>{formatCurrency(initialImpact)}</dd></div><div><dt>Data-base</dt><dd>{pendingInitialChange.previous.initialBalanceDate} → {pendingInitialChange.next.initialBalanceDate}</dd></div></dl>} confirmLabel="Confirmar alteração" critical onCancel={() => setPendingInitialChange(null)} onConfirm={confirmInitialChange} />
      <ConfirmDialog open={Boolean(deleting)} title="Excluir conta sem movimentações" description={deleting ? `${deleting.account.name} será removida permanentemente. Esta ação só é permitida porque não há histórico vinculado.` : ''} confirmLabel="Excluir conta" danger critical onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />
    </article>
  )
}
