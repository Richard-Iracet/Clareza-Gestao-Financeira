import { useEffect, useState } from 'react'
import ConfirmDialog from '../Common/ConfirmDialog'
import { useFinance } from '../../context/FinanceContext'
import { getTransferDisplayStatus } from '../../domain/transfers/transferSelectors'
import { formatCurrency, formatDate } from '../../utils/currency'

const localToday = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const operationId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const statusLabels = { scheduled: 'Agendada', completed: 'Concluída', cancelled: 'Cancelada', reversed: 'Estornada' }

export default function TransferList({ transfers = [], onEdit }) {
  const { accounts, completeTransfer, cancelTransfer, reverseTransfer, persistence } = useFinance()
  const [pendingAction, setPendingAction] = useState(null)
  const [actionError, setActionError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [awaitingPersistence, setAwaitingPersistence] = useState(null)
  const [sawSaving, setSawSaving] = useState(false)
  const [reversal, setReversal] = useState({ date: localToday(), notes: '' })

  useEffect(() => {
    if (!awaitingPersistence) return
    if (persistence.status === 'error') {
      setFeedback({ type: 'error', text: 'A operação foi revertida porque não foi confirmada no armazenamento. Use o aviso de armazenamento para tentar novamente ou exportar um backup.' })
      setAwaitingPersistence(null)
      return
    }
    if (persistence.status === 'unsaved') {
      setFeedback({ type: 'info', text: 'A operação foi registrada no snapshot, mas o espelho de compatibilidade requer atenção.' })
      setAwaitingPersistence(null)
      return
    }
    if (persistence.status === 'saving' || persistence.pendingChanges) {
      setSawSaving(true)
      return
    }
    if (sawSaving && persistence.status === 'synced' && !persistence.pendingChanges) {
      setFeedback({ type: 'success', text: awaitingPersistence.message })
      setAwaitingPersistence(null)
      setSawSaving(false)
    }
  }, [awaitingPersistence, persistence.pendingChanges, persistence.status, sawSaving])

  if (!transfers.length) return <div className="transfer-empty-state"><strong>Nenhuma transferência encontrada.</strong><span>Use o formulário acima para movimentar valores entre contas, sem alterar receitas ou despesas.</span></div>

  const accountName = (accountId) => accounts.find((account) => account.accountId === accountId)?.name || 'Conta removida'
  const openAction = (type, transfer) => {
    setActionError('')
    setPendingAction({ type, transfer })
    if (type === 'reverse') setReversal({ date: localToday(), notes: '' })
  }
  const closeAction = () => {
    if (awaitingPersistence) return
    setPendingAction(null)
    setActionError('')
  }
  const confirmAction = () => {
    if (!pendingAction || awaitingPersistence) return
    const { type, transfer } = pendingAction
    const result = type === 'complete'
      ? completeTransfer(transfer.transferId, { operationId: operationId() })
      : type === 'cancel'
        ? cancelTransfer(transfer.transferId, { operationId: operationId() })
        : reverseTransfer(transfer.transferId, reversal, { operationId: operationId() })
    if (!result?.success) {
      setActionError(result?.errors?.join(' ') || result?.message || 'Não foi possível concluir a operação.')
      return
    }
    const messages = {
      complete: 'Transferência concluída e salva.',
      cancel: 'Transferência agendada cancelada e salva.',
      reverse: 'Estorno registrado e salvo.',
    }
    setPendingAction(null)
    setFeedback({ type: 'info', text: 'Operação registrada. Confirmando a gravação no armazenamento…' })
    setAwaitingPersistence({ message: messages[type] })
    setSawSaving(false)
  }
  const dialogCopy = pendingAction && {
    complete: {
      title: 'Concluir transferência agendada',
      description: 'A transferência passará a afetar o saldo realizado das duas contas. O histórico será preservado.',
      confirm: 'Concluir transferência',
    },
    cancel: {
      title: 'Cancelar transferência agendada',
      description: 'O agendamento será mantido no histórico como cancelado e não afetará os saldos.',
      confirm: 'Cancelar transferência',
    },
    reverse: {
      title: 'Estornar transferência concluída',
      description: 'Um evento de estorno devolverá o valor à origem e retirará o valor do destino. A transferência original não será apagada.',
      confirm: 'Registrar estorno',
    },
  }[pendingAction.type]

  return <section className="transfer-history" aria-labelledby="transfer-history-title">
    <div className="transfer-history-heading"><div><p className="eyebrow">Histórico interno</p><h3 id="transfer-history-title">Transferências</h3></div><span>{transfers.length} {transfers.length === 1 ? 'transferência' : 'transferências'}</span></div>
    {feedback && <p className={feedback.type === 'success' ? 'success-message' : feedback.type === 'error' ? 'form-error' : 'transfer-feedback'} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
    <ul className="transfer-list">{transfers.map((transfer) => {
      const displayedStatus = getTransferDisplayStatus(transfer)
      const canEdit = transfer.status === 'scheduled'
      const canReverse = transfer.status === 'completed' && !transfer.reversal
      return <li key={transfer.transferId} className={`transfer-item ${displayedStatus}`}>
        <div className="transfer-symbol" aria-hidden="true">⇄</div>
        <div className="transfer-main">
          <div className="transfer-title"><strong>{transfer.description || 'Transferência interna'}</strong><span className={`transfer-status ${displayedStatus}`}>{statusLabels[displayedStatus] || displayedStatus}</span>{transfer.generatedFromRecurrence && <span className="recurrence-badge">Recorrente</span>}{transfer.detachedFromRecurrence && <span className="recurrence-badge detached">Editada isoladamente</span>}</div>
          <p>{accountName(transfer.sourceAccountId)} <span aria-hidden="true">→</span> {accountName(transfer.destinationAccountId)} · {formatDate(transfer.date)}</p>
          <small>Taxa: {formatCurrency(Number(transfer.fee || 0))}{transfer.reversal ? ` · Estornada em ${formatDate(transfer.reversal.date)}` : ''}</small>
          {transfer.notes && <p className="transfer-notes">{transfer.notes}</p>}
        </div>
        <div className="transfer-value"><strong>{formatCurrency(Number(transfer.amount || 0))}</strong><span>Saída e entrada internas</span></div>
        <div className="transfer-actions">
          {canEdit && <button type="button" className="text-button" disabled={Boolean(awaitingPersistence)} onClick={() => onEdit?.(transfer)}>Editar</button>}
          {canEdit && <button type="button" className="outline-button" disabled={Boolean(awaitingPersistence)} onClick={() => openAction('complete', transfer)}>Concluir</button>}
          {canEdit && <button type="button" className="text-button" disabled={Boolean(awaitingPersistence)} onClick={() => openAction('cancel', transfer)}>Cancelar</button>}
          {canReverse && <button type="button" className="outline-button" disabled={Boolean(awaitingPersistence)} onClick={() => openAction('reverse', transfer)}>Estornar</button>}
        </div>
      </li>
    })}</ul>
    <ConfirmDialog open={Boolean(pendingAction)} title={dialogCopy?.title} description={dialogCopy?.description} confirmLabel={dialogCopy?.confirm} danger={pendingAction?.type !== 'complete'} critical loading={Boolean(awaitingPersistence)} error={actionError} onCancel={closeAction} onConfirm={confirmAction}>
      {pendingAction && <dl className="compact-stats"><div><dt>Origem</dt><dd>{accountName(pendingAction.transfer.sourceAccountId)}</dd></div><div><dt>Destino</dt><dd>{accountName(pendingAction.transfer.destinationAccountId)}</dd></div><div><dt>Valor</dt><dd>{formatCurrency(Number(pendingAction.transfer.amount || 0))}</dd></div><div><dt>Data</dt><dd>{formatDate(pendingAction.transfer.date)}</dd></div></dl>}
      {pendingAction?.type === 'reverse' && <div className="reversal-form"><label>Data do estorno<input required type="date" value={reversal.date} onChange={(event) => setReversal((current) => ({ ...current, date: event.target.value }))} /></label><label>Observação<textarea rows="2" value={reversal.notes} onChange={(event) => setReversal((current) => ({ ...current, notes: event.target.value }))} placeholder="Opcional" /></label></div>}
    </ConfirmDialog>
  </section>
}
