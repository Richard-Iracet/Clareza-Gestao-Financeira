const LEASE_DURATION = 15000

export const createMultiTabLease = (backend, userId, ownerId, now = () => Date.now()) => {
  const key = `clareza:user:${userId}:sync_lease`
  return {
    acquire() {
      const current = (() => {
        try { return JSON.parse(backend.getItem(key)) } catch { return null }
      })()
      if (current?.ownerId !== ownerId && Number(current?.expiresAt || 0) > now()) return false
      const lease = { ownerId, expiresAt: now() + LEASE_DURATION }
      backend.setItem(key, JSON.stringify(lease))
      try { return JSON.parse(backend.getItem(key))?.ownerId === ownerId } catch { return false }
    },
    release() {
      try {
        const current = JSON.parse(backend.getItem(key))
        if (current?.ownerId === ownerId) backend.removeItem(key)
      } catch { /* lease inválido expira naturalmente */ }
    },
  }
}
