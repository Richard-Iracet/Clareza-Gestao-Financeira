import { formatCurrency } from '../../utils/currency'

export default function FinancialMetricCard({ title, value, description, meta, kind = 'neutral', featured = false, onOpen }) {
  return <button type="button" className={`financial-metric ${kind} ${featured ? 'featured' : ''}`} onClick={onOpen} aria-label={`${title}: ${formatCurrency(value)}. Ver detalhes`}>
    <span className="metric-label">{title}</span>
    <strong>{formatCurrency(value)}</strong>
    <span className="metric-description">{description}</span>
    {meta && <small>{meta}</small>}
    <span className="metric-action">Ver detalhes <span aria-hidden="true">→</span></span>
  </button>
}
