import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, details) {
    console.error('Falha não tratada na interface do Clareza.', error, details)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="auth-screen">
      <section className="auth-card" role="alert">
        <h1>Não foi possível exibir esta tela</h1>
        <p>Seus dados armazenados não foram apagados. Recarregue a aplicação; se o problema continuar, exporte o backup pela tela de recuperação.</p>
        <button className="primary-button" onClick={() => window.location.reload()}>Recarregar</button>
      </section>
    </main>
  }
}
