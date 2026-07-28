import { useState } from 'react'
import { formatCurrency } from '../../utils/currency'
import { useFinance } from '../../context/FinanceContext'
import useDialogAccessibility from '../../hooks/useDialogAccessibility'

const monthName = (month, year) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const operationId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`

export default function PayInvoiceModal({ invoice, onConfirm, onClose }) {
  const dialogRef = useDialogAccessibility(onClose)
  const { accounts } = useFinance()
  const [accountId, setAccountId] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const activeAccounts = accounts.filter((account) => !account.archived)
  const confirm = () => {
    if (submitting) return
    setSubmitting(true)
    const result = onConfirm?.({ accountId: accountId || null, paymentDate, notes, operationId: operationId() })
    if (!result?.success) {
      setError(result?.message || 'Não foi possível registrar o pagamento da fatura.')
      setSubmitting(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="modal pay-modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <span className="modal-symbol">✓</span>
        <h2 id="pay-title">Pagar fatura</h2>
        <p>Confirmar pagamento da fatura {invoice.cardName} de {monthName(invoice.invoiceMonth, invoice.invoiceYear)} no valor de <strong>{formatCurrency(invoice.totalPending ?? invoice.total)}</strong>?</p>
        <p className="modal-note">A compra no cartão continua sendo a despesa de consumo. Esta escolha registra somente a saída de caixa da conta pagadora.</p>
        <div className="pay-account-form">
          <label>Conta pagadora<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Sem conta definida</option>{activeAccounts.map((account) => <option value={account.accountId} key={account.accountId}>{account.name}</option>)}</select></label>
          <label>Data do pagamento<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
          <label>Observações<textarea rows="2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" /></label>
        </div>
        {!accountId && <p className="modal-note">Sem conta definida, o pagamento será preservado no histórico, mas não afetará um saldo bancário.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="text-button" disabled={submitting} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={submitting} onClick={confirm}>{submitting ? 'Registrando...' : 'Confirmar pagamento'}</button></div>
      </section>
    </div>
  )
}
