import { useEffect, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { createBackup, downloadBackup, downloadRawStorage } from '../utils/backup'
import { getBrowserStorage } from '../utils/storage'

const labels = { QUOTA_EXCEEDED: 'O espaço de armazenamento do navegador acabou.', STORAGE_BLOCKED: 'O navegador bloqueou o acesso ao armazenamento.', CORRUPTED_DATA: 'O estado salvo não pôde ser validado.', compatibility: 'O snapshot está seguro, mas o espelho de compatibilidade ficou incompleto.', WRITE_VERIFICATION_ERROR: 'Os dados foram enviados, mas a gravação não pôde ser confirmada.', UNKNOWN_STORAGE_ERROR: 'Não foi possível salvar os dados.' }

export default function StorageAlert() {
  const { persistence, retryPersistence, startEmptyAfterConfirmation, transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments, filters } = useFinance()
  const [dismissed, setDismissed] = useState(false)
  const [details, setDetails] = useState(false); const [confirmation, setConfirmation] = useState('')
  useEffect(() => setDismissed(false), [persistence.status, persistence.message])
  if (dismissed || !['error', 'unsaved'].includes(persistence.status)) return null
  const exportNow = () => { try { const backend = getBrowserStorage(); if (!backend) return; downloadBackup(createBackup(backend, { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments, filters })) } catch { /* the alert remains visible */ } }
  const rawExport = () => { const backend = getBrowserStorage(); if (backend) downloadRawStorage(backend) }
  const openSettings = () => document.querySelector('.settings-section')?.scrollIntoView({ behavior: 'smooth' })
  return <><aside className="storage-alert" role="alert"><div><strong>Dados ainda não confirmados no armazenamento</strong><p>{labels[persistence.errorType] || persistence.message || 'Há alterações somente nesta sessão.'} {persistence.message || ''}</p></div><div className="storage-alert-actions"><button className="secondary-button" onClick={retryPersistence}>Tentar novamente</button><button className="text-button" onClick={exportNow}>Exportar backup</button><button className="text-button" onClick={() => setDetails(true)}>Ver detalhes</button><button className="icon-button" aria-label="Fechar aviso" onClick={() => setDismissed(true)}>×</button></div></aside>{details && <div className="modal-backdrop"><section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><h2 id="recovery-title">Recuperação dos dados</h2><p>Status: <strong>{persistence.status}</strong>. Origem recuperada: {persistence.recoveredFrom || 'nenhuma'}.</p><div className="settings-actions"><button className="outline-button" onClick={openSettings}>Importar backup</button><button className="outline-button" onClick={rawExport}>Exportar dados brutos</button><button className="text-button" onClick={() => setDetails(false)}>Cancelar</button></div>{persistence.errorType === 'CORRUPTED_DATA' && <div className="empty-confirm"><p>Para iniciar vazio, digite <strong>INICIAR VAZIO</strong>. Os dados corrompidos não serão apagados automaticamente.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><button className="danger-button" disabled={confirmation !== 'INICIAR VAZIO'} onClick={() => { startEmptyAfterConfirmation(); setDetails(false) }}>Iniciar vazio</button></div>}</section></div>}</>
}
