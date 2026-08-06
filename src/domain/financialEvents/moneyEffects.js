import { normalizeImportedMoney } from '../import/moneyNormalizer.js'
import { getAccountingRule } from './accountingMatrix.js'
const minor = (value) => { const result = normalizeImportedMoney(String(value ?? ''), { decimalFormat: 'international' }); if (!result.valid) throw new Error('Valor monetário inválido.'); return BigInt(result.minorUnits) }
export const calculateFinancialEffects = ({ eventType, amount }) => {
  return calculateEffectsWithRule({ amount, rule: getAccountingRule(eventType) })
}
export const calculateEffectsWithRule = ({ amount, rule }) => { const parsed = minor(amount), value = parsed < 0n ? -parsed : parsed; return Object.fromEntries(['cash','consumption','invoice','result','netWorth'].map((name) => [name, (value * BigInt(rule[name])).toString()])) }
export const minorUnits = minor
