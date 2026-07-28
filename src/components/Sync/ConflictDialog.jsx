import { useState } from 'react'
import { useFinance } from '../../context/FinanceContext.jsx'
import { useSync } from '../../context/SyncContext.jsx'
import { createBackup, downloadBackup } from '../../utils/backup.js'
import { getBrowserStorage } from '../../utils/storage.js'

const runtimeFrom = (data) => ({ ...data, invoicePayments: data.invoiceRecords })

export default function ConflictDialog() {
  const sync = useSync()
  const finance = useFinance()
  const [confirmation, setConfirmation] = useState('')
  if (!['conflict', 'setup-required'].includes(sync.status)) return null
  const remoteExists = Boolean(sync.conflict?.remoteSnapshot)
  const exportData = (data) => {
    const backend = getBrowserStorage()
    if (backend) downloadBackup(createBackup(backend, runtimeFrom(data)))
  }
  return <div className="modal-backdrop sync-conflict-backdrop">
    <section className="modal sync-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title">
      <h2 id="sync-conflict-title">{remoteExists ? 'Conflito entre dispositivos' : 'Primeira sincronização'}</h2>
      <p>{remoteExists ? 'Os dados locais são diferentes dos dados salvos na nuvem. Nenhuma versão será substituída sem sua escolha.' : 'Foram encontrados dados neste navegador e ainda não existe estado remoto. Confirme o envio inicial.'}</p>
      <div className="sync-version-actions">
        <button className="outline-button" onClick={() => exportData(finance.financeState)}>Exportar versão local</button>
        {remoteExists && <button className="outline-button" onClick={() => exportData(sync.conflict.remoteSnapshot.data)}>Exportar versão da nuvem</button>}
      </div>
      {remoteExists && <label className="sync-confirm-label">Para substituir a nuvem pela versão local, digite <strong>USAR LOCAL</strong>.
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </label>}
      <div className="modal-actions">
        {remoteExists && <button className="secondary-button" onClick={sync.useRemote}>Usar versão da nuvem</button>}
        <button className={remoteExists ? 'danger-button' : 'primary-button'} disabled={remoteExists && confirmation !== 'USAR LOCAL'} onClick={sync.uploadLocal}>{remoteExists ? 'Enviar versão local' : 'Enviar dados locais'}</button>
      </div>
    </section>
  </div>
}
