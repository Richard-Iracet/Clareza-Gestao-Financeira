import test from 'node:test'
import assert from 'node:assert/strict'
import { readSupabaseEnvironment } from '../src/infrastructure/supabase/environment.js'

test('ambiente Supabase informa todas as variáveis ausentes sem expor valores', () => {
  const result = readSupabaseEnvironment({})
  assert.equal(result.configured, false)
  assert.deepEqual(result.missing, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
  assert.equal(result.errors.some((message) => message.includes('undefined')), false)
})

test('ambiente Supabase aceita URL HTTPS e chave pública', () => {
  const result = readSupabaseEnvironment({
    VITE_SUPABASE_URL: 'https://projeto-teste.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'chave-publica',
  })
  assert.equal(result.configured, true)
  assert.equal(result.url, 'https://projeto-teste.supabase.co')
})

test('ambiente Supabase rejeita URL fora do domínio esperado', () => {
  const result = readSupabaseEnvironment({
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_ANON_KEY: 'chave-publica',
  })
  assert.equal(result.configured, false)
  assert.match(result.errors.join(' '), /URL HTTPS/)
})
