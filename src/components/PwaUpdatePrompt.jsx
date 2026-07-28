import { useEffect, useState } from 'react'

export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [registration, setRegistration] = useState(null)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return undefined
    let active = true
    navigator.serviceWorker.register('/sw.js').then((nextRegistration) => {
      if (!active) return
      setRegistration(nextRegistration)
      nextRegistration.addEventListener('updatefound', () => {
        const worker = nextRegistration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setNeedRefresh(true)
        })
      })
    }).catch((error) => console.error('Não foi possível registrar o service worker.', error))
    const reloading = () => window.location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', reloading)
    return () => {
      active = false
      navigator.serviceWorker.removeEventListener('controllerchange', reloading)
    }
  }, [])
  if (!needRefresh) return null
  return <aside className="pwa-update" role="status">
    <div><strong>Nova versão disponível</strong><p>Atualize quando terminar suas alterações pendentes.</p></div>
    <button className="primary-button" onClick={() => registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })}>Atualizar</button>
    <button className="text-button" onClick={() => setNeedRefresh(false)}>Depois</button>
  </aside>
}
