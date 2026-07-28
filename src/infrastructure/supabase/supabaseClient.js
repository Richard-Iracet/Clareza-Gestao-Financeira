import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnvironment } from './environment.js'

let client

export const getSupabaseClient = () => {
  if (client) return client
  const environment = readSupabaseEnvironment()
  if (!environment.configured) {
    throw new Error(`Supabase não configurado. ${environment.errors.join(' ')}`)
  }
  client = createClient(environment.url, environment.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'clareza:supabase-auth',
    },
  })
  return client
}

export const resetSupabaseClientForTests = () => {
  client = undefined
}
