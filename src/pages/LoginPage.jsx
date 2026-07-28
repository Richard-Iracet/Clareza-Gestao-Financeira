import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const target = typeof location.state?.from === 'string' && location.state.from !== '/login' ? location.state.from : '/'

  if (auth.status === 'authenticated') return <Navigate to={target} replace />

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const result = await auth.login(email, password)
    if (result.success) navigate(target, { replace: true })
    else setError(result.message)
  }

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand" aria-hidden="true">C</div>
      <h1>Entrar no Clareza</h1>
      <p>Acesse seus dados financeiros sincronizados.</p>
      {auth.status === 'configuration-error' && <div className="auth-error" role="alert">{auth.error}</div>}
      <form onSubmit={submit}>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} disabled={auth.status === 'loading'} /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={auth.status === 'loading'} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={auth.status === 'loading' || auth.status === 'configuration-error'}>{auth.status === 'loading' ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <small>O cadastro público não está disponível. Crie o usuário no painel do Supabase.</small>
    </section>
  </main>
}
