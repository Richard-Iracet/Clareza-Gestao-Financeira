import { useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import useDialogAccessibility from '../../hooks/useDialogAccessibility'

export default function CategoryManager({ onClose }) {
  const { categories, transactions, recurrences = [], addCategory, removeCategory } = useFinance()
  const [name, setName] = useState('')
  const dialogRef = useDialogAccessibility(onClose)
  const submit = (event) => { event.preventDefault(); if (name.trim()) { addCategory(name.trim()); setName('') } }
  const remove = (category) => {
    if (transactions.some((item) => item.category === category) || recurrences.some((item) => item.category === category)) return
    removeCategory(category)
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="categories-title">
        <div className="section-heading"><div><p className="eyebrow">Personalização</p><h2 id="categories-title">Categorias</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></div>
        <form className="category-form" onSubmit={submit}><label className="visually-hidden" htmlFor="new-category">Nova categoria</label><input id="new-category" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova categoria" /><button className="primary-button">Adicionar</button></form>
        <ul className="category-list">{categories.map((category) => { const used = transactions.some((item) => item.category === category) || recurrences.some((item) => item.category === category); return <li key={category}><span>{category}</span><button type="button" disabled={used} title={used ? 'Categoria em uso' : `Excluir ${category}`} aria-label={used ? `${category} está em uso e não pode ser excluída` : `Excluir categoria ${category}`} onClick={() => remove(category)}>×</button></li> })}</ul>
      </section>
    </div>
  )
}
