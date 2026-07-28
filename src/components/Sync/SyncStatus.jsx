import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSync } from '../../context/SyncContext.jsx'

const labels = {
  loading: 'Carregando nuvem',
  synchronized: 'Salvo na nuvem',
  saving: 'Salvando',
  pending: 'Alterações pendentes',
  offline: 'Sem conexão',
  error: 'Erro ao sincronizar',
  conflict: 'Conflito entre dispositivos',
  'setup-required': 'Primeira sincronização',
}

export default function SyncStatus() {
  const sync = useSync()
  const auth = useAuth()
  const [details, setDetails] = useState(false)
  const logout = async () => { await auth.logout() }
  return <div className={`sync-status sync-${sync.status}`}>
    <button type="button" className="sync-status-button" onClick={() => setDetails((value) => !value)} aria-expanded={details}>
      <span aria-hidden="true" />
      {labels[sync.status] || sync.status}
    </button>
    {details && <div className="sync-popover">
      <strong>{labels[sync.status]}</strong>
      {sync.message && <p>{sync.message}</p>}
      {sync.lastSyncedAt && <small>Última sincronização: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(sync.lastSyncedAt))}</small>}
      {['error', 'offline', 'pending'].includes(sync.status) && <button className="text-button" onClick={sync.retry}>Tentar novamente</button>}
      <button className="text-button" onClick={logout}>Sair</button>
    </div>}
  </div>
}
