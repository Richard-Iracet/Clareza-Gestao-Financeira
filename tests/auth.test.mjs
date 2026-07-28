import test from 'node:test'
import assert from 'node:assert/strict'
import { signInWithEmail, signOutSession } from '../src/infrastructure/supabase/authService.js'

test('login valida credenciais antes de acessar o Supabase', async () => {
  const client = { auth: { signInWithPassword: () => assert.fail('não deveria chamar') } }
  const result = await signInWithEmail(client, '', '')
  assert.equal(result.success, false)
  assert.equal(result.errorCode, 'INVALID_CREDENTIALS')
})

test('login usa e-mail e senha sem oferecer cadastro público', async () => {
  let received
  const client = { auth: { signInWithPassword: async (credentials) => {
    received = credentials
    return { data: { session: { access_token: 'token' }, user: { id: 'user-1' } }, error: null }
  } } }
  const result = await signInWithEmail(client, ' pessoa@example.com ', 'segredo')
  assert.equal(result.success, true)
  assert.deepEqual(received, { email: 'pessoa@example.com', password: 'segredo' })
})

test('login classifica falha de rede e logout propaga erro compreensível', async () => {
  const login = await signInWithEmail({ auth: { signInWithPassword: async () => { throw new TypeError('Failed to fetch') } } }, 'a@b.com', 'senha')
  assert.equal(login.errorCode, 'NETWORK_ERROR')
  const logout = await signOutSession({ auth: { signOut: async () => ({ error: new Error('falha') }) } })
  assert.equal(logout.success, false)
})
