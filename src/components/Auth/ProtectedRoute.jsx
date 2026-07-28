import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <main className="auth-screen"><section className="auth-card" role="status"><h1>Clareza</h1><p>Restaurando sua sessão com segurança…</p></section></main>
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
