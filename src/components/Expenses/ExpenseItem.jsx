import { useFinance } from '../../context/FinanceContext'
import { formatCurrency, formatDate } from '../../utils/currency'
import { invoiceStatusLabels } from '../Invoices/InvoiceCard'

const necessityLabels = { essential: 'Essencial', important: 'Importante', superfluous: 'Supérfluo' }
const monthName = (month, year) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))

export default function ExpenseItem({ item, onEdit, onDelete, onToggle, selected, onSelect }) {
  const { cards, invoices, accounts } = useFinance()
  const invoice = item.invoiceId ? invoices.find((value) => value.id === item.invoiceId) : null
  const card = item.cardId ? cards.find((value) => value.id === item.cardId) : null
  const account = item.accountId ? accounts.find((value) => value.accountId === item.accountId) : null
  const realized = item.status === 'paid' || item.status === 'received'
  return (
    <li className="transaction-item">
      <label className="select-transaction"><span className="visually-hidden">Selecionar {item.description}</span><input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} /></label>
      {item.cardId ? <span className={`invoice-lock ${invoice?.status === 'paid' ? 'paid' : ''}`} title="Pagamento controlado pela fatura">{invoice?.status === 'paid' ? '✓' : '▣'}</span> : <button className={`status-check ${item.status}`} onClick={() => onToggle(item.id)} title={realized ? 'Marcar como pendente' : item.type === 'income' ? 'Marcar como recebida' : 'Marcar como paga'} aria-label={realized ? 'Marcar como pendente' : item.type === 'income' ? 'Marcar como recebida' : 'Marcar como paga'}>{realized ? '✓' : ''}</button>}
      <div className="transaction-main">
        <div className="transaction-title"><strong>{item.description}</strong><span className={`tag ${item.necessity}`}>{necessityLabels[item.necessity]}</span>{item.generatedFromRecurrence && <span className="recurrence-badge">Recorrente</span>}{item.detachedFromRecurrence && <span className="recurrence-badge detached">Editada isoladamente</span>}</div>
        <p>{item.category} · {item.cardId ? 'Compra no cartão' : account?.name || 'Sem conta definida'} · {formatDate(item.date)}</p>
        {item.cardId && <p className="invoice-reference">Cartão {card?.name} · Fatura <span className="capitalize">{monthName(item.invoiceMonth, item.invoiceYear)}</span> · Parcela {item.installment} · <span className={`inline-status ${invoice?.status}`}>{invoiceStatusLabels[invoice?.status] || 'Aberta'}</span></p>}
        {item.notes && <p className="transaction-notes">{item.notes}</p>}
      </div>
      <div className="transaction-value"><strong className={item.type}>{item.type === 'expense' ? '−' : '+'} {formatCurrency(item.amount)}</strong><span>{item.cardId ? `Fatura ${invoiceStatusLabels[invoice?.status]?.toLowerCase() || 'aberta'}` : realized ? item.type === 'income' ? 'Recebido' : 'Pago' : `Vence ${formatDate(item.dueDate)}`}</span></div>
      <div className="item-actions"><button onClick={() => onEdit(item)} aria-label={`Editar ${item.description}`} title="Editar">✎</button><button onClick={() => onDelete(item)} aria-label={`Excluir ${item.description}`} title="Excluir">⌫</button></div>
    </li>
  )
}
