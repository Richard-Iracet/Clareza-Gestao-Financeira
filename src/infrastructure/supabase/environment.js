const REQUIRED_VARIABLES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

export const readSupabaseEnvironment = (source = import.meta.env || {}) => {
  const values = Object.fromEntries(REQUIRED_VARIABLES.map((key) => [key, String(source[key] || '').trim()]))
  const missing = REQUIRED_VARIABLES.filter((key) => !values[key])
  const validUrl = !values.VITE_SUPABASE_URL || /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(values.VITE_SUPABASE_URL)
  const errors = [
    ...missing.map((key) => `Variável obrigatória ausente: ${key}.`),
    ...(!validUrl ? ['VITE_SUPABASE_URL deve ser uma URL HTTPS do Supabase.'] : []),
  ]

  return {
    configured: errors.length === 0,
    url: values.VITE_SUPABASE_URL,
    anonKey: values.VITE_SUPABASE_ANON_KEY,
    missing,
    errors,
  }
}
