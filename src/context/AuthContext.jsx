import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { signInWithEmail, signOutSession } from '../infrastructure/supabase/authService.js'
import { getSupabaseClient } from '../infrastructure/supabase/supabaseClient.js'
import { deactivateUserSession } from '../infrastructure/storage/localFinanceRepository.js'
import { getBrowserStorage } from '../utils/storage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', session: null, user: null, error: null })
  const [client, setClient] = useState(null)
  const activeUserIdRef = useRef(null)

  useEffect(() => {
    let active = true
    let subscription
    try {
      const nextClient = getSupabaseClient()
      setClient(nextClient)
      nextClient.auth.getSession().then(({ data, error }) => {
        if (!active) return
        if (error) setState({ status: 'error', session: null, user: null, error: error.message })
        else {
          activeUserIdRef.current = data.session?.user?.id || null
          setState({ status: data.session ? 'authenticated' : 'anonymous', session: data.session, user: data.session?.user || null, error: null })
        }
      })
      const listener = nextClient.auth.onAuthStateChange((event, session) => {
        if (!active) return
        if (event === 'SIGNED_OUT') {
          if (activeUserIdRef.current) deactivateUserSession(getBrowserStorage(), activeUserIdRef.current)
          activeUserIdRef.current = null
          setState({ status: 'anonymous', session: null, user: null, error: null })
        } else if (session) {
          activeUserIdRef.current = session.user.id
          setState({ status: 'authenticated', session, user: session.user, error: null })
        }
      })
      subscription = listener.data.subscription
    } catch (error) {
      setState({ status: 'configuration-error', session: null, user: null, error: error.message })
    }
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email, password) => {
    if (!client) return { success: false, errorCode: 'CONFIGURATION_ERROR', message: state.error || 'Supabase não configurado.' }
    setState((current) => ({ ...current, status: 'loading', error: null }))
    const result = await signInWithEmail(client, email, password)
    if (!result.success) setState((current) => ({ ...current, status: 'anonymous', error: result.message }))
    return result
  }, [client, state.error])

  const logout = useCallback(async () => {
    if (!client) return { success: false, errorCode: 'CONFIGURATION_ERROR', message: 'Supabase não configurado.' }
    const result = await signOutSession(client)
    if (!result.success) setState((current) => ({ ...current, error: result.message }))
    return result
  }, [client])

  const value = useMemo(() => ({ ...state, client, login, logout }), [state, client, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
