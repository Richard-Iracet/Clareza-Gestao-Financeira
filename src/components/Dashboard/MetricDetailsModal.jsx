import { useEffect, useRef } from 'react'
import { formatCurrency, formatDate } from '../../utils/currency'

const safeDate = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? formatDate(String(value).slice(0, 10)) : '—'
const Groups = ({ title, items = [] }) => items.length ? <section className="detail-groups"><h3>{title}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{formatCurrency(item.value)}</dd></div>)}</dl></section> : null
const ItemList = ({ title, items = [] }) => items.length ? <section className="detail-items"><h3>{title}</h3><ul>{items.map((item, index) => <li key={item.id || item.transferId || index}><div><strong>{item.description || item.name}</strong><span>{item.category || item.origin || 'Sem categoria'} · {safeDate(item.date || item.dueDate)}</span></div><b>{formatCurrency(Number(item.amount ?? item.totalPending ?? 0))}</b></li>)}</ul></section> : null

export default function MetricDetailsModal({ detail, onClose, onNavigate }) {
  const closeRef = useRef(null)
  useEffect(() => { const previous = document.activeElement; closeRef.current?.focus(); const key = (event) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus?.() } }, [onClose])
  return <div className="modal-backdrop metric-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal metric-modal" role="dialog" aria-modal="true" aria-labelledby="metric-modal-title"><header><div><p className="eyebrow">Entenda o indicador</p><h2 id="metric-modal-title">{detail.title}</h2><p>{detail.description}</p></div><button ref={closeRef} type="button" className="metric-modal-close" onClick={onClose} aria-label="Fechar detalhes">×</button></header><div className="metric-modal-total"><span>Total</span><strong>{formatCurrency(detail.total)}</strong><small>{detail.period}</small></div>
    {detail.type === 'accounts' && <section className="account-composition"><h3>Composição por conta</h3><ul>{detail.accounts.map((account) => <li key={account.accountId}><div><strong>{account.name}</strong><span>{account.institution || 'Sem instituição'}{account.balance < 0 ? ' · Saldo negativo' : ''}</span></div><b>{formatCurrency(account.balance)}</b></li>)}</ul></section>}
    {detail.type === 'invoices' && <section className="invoice-composition"><h3>Faturas por cartão</h3><ul>{detail.invoices.map((invoice) => <li key={invoice.id}><div><strong>{invoice.cardName}</strong><span>Vencimento {safeDate(invoice.dueDate)} · {invoice.status}</span></div><b>{formatCurrency(invoice.amount)}</b></li>)}</ul></section>}
    {detail.breakdown?.length > 0 && <dl className="metric-breakdown">{detail.breakdown.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.sign || ''}{formatCurrency(item.value)}</dd></div>)}</dl>}
    {detail.type === 'income' && <><Groups title="Fontes de receita" items={detail.groups} /><ItemList title="Entradas recebidas" items={detail.items} /></>}
    {detail.type === 'expenses' && <><Groups title="Por origem" items={detail.groups} /><Groups title="Principais categorias" items={detail.categories} /><ItemList title="Maiores despesas" items={detail.items} /><p className="detail-stat">{detail.count} despesa(s) consideradas no ciclo.</p></>}
    {detail.type === 'result' && <Groups title="Categorias que mais consumiram o resultado" items={detail.categories} />}
    {detail.type === 'events' && <ItemList title="Linha do tempo" items={detail.items} />}
    {Number.isFinite(detail.previous) && <p className="cycle-comparison">Ciclo anterior: <strong>{formatCurrency(detail.previous)}</strong></p>}
    {detail.action && <button type="button" className="primary-button metric-full-action" onClick={() => onNavigate(detail.action)}>{detail.action.label}</button>}
  </section></div>
}
