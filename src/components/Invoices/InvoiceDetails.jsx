import { formatCurrency, formatDate } from '../../utils/currency'

export default function InvoiceDetails({ invoice }) {
  return (
    <div className="invoice-details">
      {invoice.transactions.map((item) => (
        <div className="invoice-purchase" key={item.id}>
          <div><strong>{item.description}</strong><span>{item.category} · {item.installment}</span></div>
          <div><strong>{formatCurrency(item.amount)}</strong><span>{formatDate(item.date)}</span></div>
        </div>
      ))}
    </div>
  )
}
