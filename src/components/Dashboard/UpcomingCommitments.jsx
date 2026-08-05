import { formatCurrency, formatDate } from '../../utils/currency'

export default function UpcomingCommitments({ events, nextIncomeDate, onOpen }) {
  return <section className="upcoming-commitments panel" aria-labelledby="upcoming-title"><div className="section-heading"><div><p className="eyebrow">Agenda financeira</p><h2 id="upcoming-title">Próximos compromissos</h2><p className="muted">Eventos reconhecidos até o próximo recebimento esperado ({formatDate(nextIncomeDate)}).</p></div>{events.length > 0 && <button type="button" className="text-button" onClick={onOpen}>Ver todos</button>}</div>
    {events.length === 0 ? <p className="upcoming-empty">Nenhum compromisso conhecido até o próximo recebimento.</p> : <ul className="upcoming-list">{events.slice(0, 5).map((event) => <li key={event.id}><time dateTime={event.date}>{formatDate(event.date)}</time><div><strong>{event.description}</strong><span>{event.origin} · {event.account}</span></div><span className={`direction-label ${event.direction}`}>{event.direction === 'in' ? 'Entrada' : 'Saída'}</span><b>{event.direction === 'out' ? '−' : '+'}{formatCurrency(event.amount)}</b></li>)}</ul>}
  </section>
}
