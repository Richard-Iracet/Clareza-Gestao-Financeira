import { useState } from 'react'
import { formatCurrency } from '../../utils/currency'
import InvoiceDetails from './InvoiceDetails'
import EditableInvoiceDate from './EditableInvoiceDate'

export const invoiceStatusLabels = { open: 'Aberta', closed: 'Fechada', paid: 'Paga', overdue: 'Vencida' }
const monthName = (month, year) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))

export default function InvoiceCard({ invoice, onPay, onUpdateDate }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article className={`invoice-card ${invoice.status}`}>
      <div className="invoice-card-top"><div className={`card-logo ${invoice.cardId}`}>{invoice.cardName.slice(0, 1)}</div><span className={`status-badge ${invoice.status}`}>{invoiceStatusLabels[invoice.status]}</span></div>
      <p className="invoice-card-name">{invoice.cardName}</p>
      <h3>Fatura de <span className="capitalize">{monthName(invoice.invoiceMonth, invoice.invoiceYear)}</span></h3>
      <strong className="invoice-total">{formatCurrency(invoice.total)}</strong>
      {invoice.totalPaid > 0 && invoice.totalPending > 0 && <div className="invoice-balance"><span>Já pago: {formatCurrency(invoice.totalPaid)}</span><strong>Saldo: {formatCurrency(invoice.totalPending)}</strong></div>}
      <div className="invoice-meta"><EditableInvoiceDate label="Fechamento" value={invoice.closingDate} isCustom={Boolean(invoice.customClosingDate)} onSave={(value) => onUpdateDate(invoice.id, { customClosingDate: value })} /><EditableInvoiceDate label="Vencimento" value={invoice.dueDate} isCustom={Boolean(invoice.customDueDate)} onSave={(value) => onUpdateDate(invoice.id, { customDueDate: value })} /><span>Compras <strong>{invoice.purchaseCount}</strong></span><span>Parcelas <strong>{invoice.installmentCount}</strong></span></div>
      <div className="invoice-actions"><button className="text-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Ocultar compras' : 'Ver compras'}</button>{invoice.status !== 'paid' && <button className="primary-button" onClick={() => onPay(invoice)}>Pagar fatura</button>}</div>
      {expanded && <InvoiceDetails invoice={invoice} />}
    </article>
  )
}
