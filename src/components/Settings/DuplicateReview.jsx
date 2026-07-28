import { useMemo } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { analyzeDuplicates } from '../../utils/deduplication'
export default function DuplicateReview() {
  const { transactions, resolveConfirmedDuplicate } = useFinance(); const report = useMemo(() => analyzeDuplicates(transactions), [transactions])
  return <article className="settings-card"><div className="settings-icon">≠</div><h3>Revisão de duplicidades</h3><p>Somente identidades repetidas são confirmadas. Compras apenas semelhantes não são removidas.</p><p><strong>{report.confirmed.length}</strong> confirmada(s) · <strong>{report.probable.length}</strong> provável(is)</p>{report.confirmed.map((group) => <div className="record-row" key={`${group.reason}-${group.key}`}><div><strong>{group.reason}</strong><span>{group.items.map((item) => item.description).join(' · ')}</span></div><button className="danger-button" onClick={() => resolveConfirmedDuplicate(group.items[1].id, group.items[0].id)}>Manter o primeiro</button></div>)}{report.probable.length > 0 && <details><summary>Revisar semelhantes sem alterar</summary>{report.probable.map((group) => <p key={group.key}>{group.items.length} registros semelhantes — análise manual necessária.</p>)}</details>}</article>
}
