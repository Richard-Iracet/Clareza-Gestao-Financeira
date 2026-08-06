export const APP_ENVIRONMENTS = ['development', 'staging', 'production']

export const readAppEnvironment = (source = import.meta.env || {}) => {
  const value = String(source.VITE_APP_ENV || (source.PROD ? 'production' : 'development')).trim().toLowerCase()
  if (!APP_ENVIRONMENTS.includes(value)) return { valid: false, value, errors: [`VITE_APP_ENV desconhecido: ${value}.`] }
  return { valid: true, value, isDevelopment: value === 'development', isStaging: value === 'staging', isProduction: value === 'production', warning: value === 'staging' ? 'Ambiente de homologação: use somente dados sintéticos ou anonimizados.' : null, errors: [] }
}
