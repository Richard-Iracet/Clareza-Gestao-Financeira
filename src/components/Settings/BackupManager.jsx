import { useRef, useState } from 'react'
import { useFinance } from '../../context/FinanceContext'
import { createBackup, downloadBackup, getBackupSummary, importBackup } from '../../utils/backup'
import { parseAndValidateBackup } from '../../utils/dataValidation'
import { getBrowserStorage } from '../../utils/storage'

const formatDateTime = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

export default function BackupManager() {
  const { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments, filters } = useFinance()
  const backend = getBrowserStorage()
  const fileRef = useRef(null)
  const [feedback, setFeedback] = useState(null)
  const [preview, setPreview] = useState(null)

  const exportData = () => {
    try {
      if (!backend) throw new Error('O armazenamento do navegador não está disponível.')
      const backup = createBackup(backend, { transactions, cards, accounts, transfers, recurrences, alertStates, categories, invoicePayments, filters })
      downloadBackup(backup)
      setFeedback({ type: 'success', text: `Backup exportado com ${backup.metadata.counts.transactions} lançamento(s) e ${backup.metadata.counts.transfers} transferência(s).` })
    } catch (error) { setFeedback({ type: 'error', text: error.message }) }
  }

  const selectFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo excede o limite de segurança de 10 MB.')
      const result = parseAndValidateBackup(await file.text())
      if (!result.valid) { setPreview(null); setFeedback({ type: 'error', text: result.errors.join(' ') }); return }
      setPreview({ backup: result.backup, summary: getBackupSummary(result.backup) })
      setFeedback({ type: 'info', text: 'Backup validado. Confira o resumo antes de confirmar.' })
    } catch { setPreview(null); setFeedback({ type: 'error', text: 'Não foi possível ler o arquivo selecionado.' }) }
  }

  const confirmImport = () => {
    try {
      if (!backend) throw new Error('O armazenamento do navegador não está disponível.')
      importBackup(preview.backup, backend)
      setPreview(null)
      setFeedback({ type: 'success', text: 'Backup importado localmente com segurança. Após recarregar, confirme a versão que deverá ser sincronizada com a nuvem.' })
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) { setFeedback({ type: 'error', text: error.message }) }
  }

  return (
    <article className="settings-card">
      <div className="settings-icon">⇅</div><h3>Backup</h3>
      <p>Exporte todos os seus dados ou restaure um arquivo validado.</p>
      <div className="settings-actions"><button className="primary-button" onClick={exportData}>Exportar backup</button><button className="outline-button" onClick={() => fileRef.current?.click()}>Importar backup</button></div>
      <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={selectFile} />
      {feedback && <div className={`settings-feedback ${feedback.type}`} role="status">{feedback.text}</div>}
      {preview && <div className="backup-preview"><h4>Resumo do backup</h4><dl><div><dt>Lançamentos</dt><dd>{preview.summary.transactions}</dd></div><div><dt>Transferências</dt><dd>{preview.summary.transfers}</dd></div><div><dt>Recorrências</dt><dd>{preview.summary.recurrences}</dd></div><div><dt>Estados de alerta</dt><dd>{preview.summary.alertStates}</dd></div><div><dt>Faturas</dt><dd>{preview.summary.invoices}</dd></div><div><dt>Cartões</dt><dd>{preview.summary.cards}</dd></div><div><dt>Contas</dt><dd>{preview.summary.accounts}</dd></div><div><dt>Exportado em</dt><dd>{formatDateTime(preview.summary.exportedAt)}</dd></div><div><dt>Versão</dt><dd>{preview.summary.version} · dados v{preview.summary.financeDataVersion}</dd></div></dl><p>A importação substituirá os dados atuais. Um backup interno será criado antes da operação.</p><div className="settings-actions"><button className="text-button" onClick={() => setPreview(null)}>Cancelar</button><button className="danger-button" onClick={confirmImport}>Confirmar importação</button></div></div>}
    </article>
  )
}
