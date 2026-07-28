export const CARD_BILLING_MIGRATION_VERSION = 1
const key = (year, month) => Number(year) * 100 + Number(month)
const parseCompetence = (value) => { const match = /^(\d{4})-(\d{2})$/.exec(String(value || '')); return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? { year: Number(match[1]), month: Number(match[2]), key: key(match[1], match[2]) } : null }
const previousCompetence = (value) => { const parsed = parseCompetence(value); const date = new Date(parsed.year, parsed.month - 2, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
export const validateBillingConfigurations = (configurations = []) => {
  const errors = []; const sorted = [...configurations].sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)))
  sorted.forEach((config, index) => { const from = parseCompetence(config.effectiveFrom); const to = config.effectiveTo ? parseCompetence(config.effectiveTo) : null; if (!config.configId) errors.push('Configuração sem ID.'); if (!from) errors.push('Início de vigência inválido.'); if (config.effectiveTo && !to) errors.push('Fim de vigência inválido.'); if (from && to && to.key < from.key) errors.push('Fim anterior ao início.'); if (index && from) { const previous = sorted[index - 1]; const previousTo = previous.effectiveTo ? parseCompetence(previous.effectiveTo) : null; if (!previousTo || previousTo.key >= from.key) errors.push('Configurações sobrepostas.') } })
  return { valid: errors.length === 0, errors }
}
export const getCardBillingConfigForCompetence = (card, month, year) => {
  const configurations = card.billingConfigurations || []; if (!configurations.length) return { success: true, config: { closingDay: card.closingDay, dueDay: card.dueDay, source: 'legacy' }, legacy: true }
  const target = key(year, month); const config = configurations.find((item) => { const from = parseCompetence(item.effectiveFrom); const to = item.effectiveTo ? parseCompetence(item.effectiveTo) : null; return from && from.key <= target && (!to || to.key >= target) })
  return config ? { success: true, config } : { success: false, error: 'Nenhuma configuração cobre esta competência.' }
}
export const migrateLegacyCardConfigurations = (cards, now = new Date().toISOString()) => ({ cards: cards.map((card) => card.billingConfigurations?.length ? card : { ...card, billingConfigurations: [{ configId: id(), closingDay: Number(card.closingDay), dueDay: Number(card.dueDay), effectiveFrom: '1900-01', effectiveTo: null, createdAt: now, source: 'legacy-migrated' }] }), report: { migrationVersion: CARD_BILLING_MIGRATION_VERSION, cardsBefore: cards.length, cardsAfter: cards.length, migrated: cards.filter((card) => !card.billingConfigurations?.length).map((card) => card.id) } })
export const addCardBillingConfiguration = (card, input, now = new Date().toISOString()) => {
  if (!parseCompetence(input.effectiveFrom)) throw new Error('Competência inicial inválida.'); const closingDay = Number(input.closingDay); const dueDay = Number(input.dueDay); if (![closingDay, dueDay].every((day) => Number.isInteger(day) && day >= 1 && day <= 28)) throw new Error('Dias devem estar entre 1 e 28.')
  const current = card.billingConfigurations || []; const next = current.map((config) => config.effectiveTo === null && parseCompetence(config.effectiveFrom).key < parseCompetence(input.effectiveFrom).key ? { ...config, effectiveTo: previousCompetence(input.effectiveFrom) } : config)
  next.push({ configId: id(), closingDay, dueDay, effectiveFrom: input.effectiveFrom, effectiveTo: null, createdAt: now, source: 'user-change' }); const validation = validateBillingConfigurations(next); if (!validation.valid) throw new Error(validation.errors.join(' '))
  return { ...card, closingDay, dueDay, billingConfigurations: next, audit: [...(card.audit || []).slice(-49), { eventId: id(), type: 'card_billing_config_created', createdAt: now, affectedIds: [card.id], reason: `effective-from-${input.effectiveFrom}` }] }
}
