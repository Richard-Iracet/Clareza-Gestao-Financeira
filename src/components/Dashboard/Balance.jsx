import { formatCurrency } from '../../utils/currency'

export default function Balance({ value }) {
  return (
    <article className="balance-card">
      <div><p>Saldo realizado</p><strong>{formatCurrency(value)}</strong><small>Recebido menos pago</small></div>
      <span className="balance-icon">↗</span>
    </article>
  )
}
