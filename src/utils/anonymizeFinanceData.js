const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value))
const pseudonym = (prefix, id, index) => `${prefix} ${String(index + 1).padStart(2, '0')}-${String(id || index).slice(-4)}`
const transformAmount = (value, factor) => typeof value === 'number' ? Math.round(value * factor * 100) / 100 : value

export const anonymizeFinanceData = (state, options = {}) => {
  const output = clone(state || {})
  const factor = Number.isFinite(Number(options.amountFactor)) ? Number(options.amountFactor) : 1
  ;(output.accounts || []).forEach((item, index) => { item.name = pseudonym('Conta', item.accountId, index) })
  ;(output.cards || []).forEach((item, index) => { item.name = pseudonym('Cartao', item.id, index) })
  ;(output.transactions || []).forEach((item, index) => { item.description = pseudonym('Lancamento', item.id, index); ['amount', 'installmentAmount', 'purchaseTotal'].forEach((field) => { if (field in item) item[field] = transformAmount(item[field], factor) }) })
  ;(output.transfers || []).forEach((item, index) => { item.description = pseudonym('Transferencia', item.transferId, index); ['amount', 'fee'].forEach((field) => { if (field in item) item[field] = transformAmount(item[field], factor) }) })
  ;(output.recurrences || []).forEach((item, index) => { item.description = pseudonym('Recorrencia', item.recurrenceId, index); if ('amount' in item) item.amount = transformAmount(item.amount, factor) })
  return { data: output, warning: 'Fixture anonimizada localmente; revise campos livres e metadados, pois permanece risco residual de reidentificacao.' }
}
