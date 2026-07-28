import ExpenseItem from './ExpenseItem'

export default function ExpenseList({ transactions, onEdit, onDelete, onToggle, selected = [], onSelect }) {
  if (!transactions.length) return <div className="empty-state"><span>◎</span><h3>Nenhum lançamento encontrado com os filtros selecionados.</h3><p>Limpe os filtros, ajuste o período ou cadastre um novo lançamento.</p></div>
  return <ul className="transaction-list">{transactions.map((item) => <ExpenseItem key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} selected={selected.includes(item.id)} onSelect={onSelect} />)}</ul>
}
