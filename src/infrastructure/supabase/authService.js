const friendlyAuthError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('invalid login credentials')) return 'E-mail ou senha inválidos.'
  if (message.includes('email not confirmed')) return 'O e-mail ainda não foi confirmado.'
  if (message.includes('network') || message.includes('fetch')) return 'Não foi possível conectar ao serviço de autenticação.'
  return error?.message || 'Não foi possível concluir a autenticação.'
}

export const signInWithEmail = async (client, email, password) => {
  if (!email?.trim() || !password) return { success: false, errorCode: 'INVALID_CREDENTIALS', message: 'Informe e-mail e senha.' }
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { success: false, errorCode: 'AUTH_ERROR', message: friendlyAuthError(error), error }
    return { success: true, session: data.session, user: data.user }
  } catch (error) {
    return { success: false, errorCode: 'NETWORK_ERROR', message: friendlyAuthError(error), error }
  }
}

export const signOutSession = async (client) => {
  try {
    const { error } = await client.auth.signOut()
    if (error) return { success: false, errorCode: 'AUTH_ERROR', message: friendlyAuthError(error), error }
    return { success: true }
  } catch (error) {
    return { success: false, errorCode: 'NETWORK_ERROR', message: friendlyAuthError(error), error }
  }
}
