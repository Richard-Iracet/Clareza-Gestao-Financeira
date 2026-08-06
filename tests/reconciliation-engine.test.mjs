import test from 'node:test'
import assert from 'node:assert/strict'
import { materializeExactAutomaticMatches, runReconciliationEngine } from '../src/domain/reconciliation/reconciliationEngine.js'
import { extractReconciliationFeatures } from '../src/domain/reconciliation/featureExtractor.js'
import { evaluateBlockingRules } from '../src/domain/reconciliation/blockingRules.js'

const userId = '00000000-0000-4000-8000-000000000001'
const raw = (patch = {}) => ({ id: crypto.randomUUID(), userId, amount: '-10.00', currency: 'BRL', accountingDate: '2026-08-01', financialAccountId: 'a1', description: 'Compra Mercado', source: 'ofx', ...patch })
const financial = (patch = {}) => ({ id: crypto.randomUUID(), userId, amount: '-10.00', currency: 'BRL', transactionDate: '2026-08-01', accountId: 'a1', description: 'Mercado', source: 'manual', type: 'expense', ...patch })

test('modo desativado não produz candidatos ou mutações', () => { const result = runReconciliationEngine({ userId, rawTransactions: [raw()], financialTransactions: [financial()] }); assert.equal(result.run.status, 'skipped'); assert.deepEqual(result.candidates, []); assert.deepEqual(result.automaticMatches, []) })
test('sem identidade exata, valor/data/descrição são apenas sugestão', () => { const result = runReconciliationEngine({ userId, rawTransactions: [raw()], financialTransactions: [financial()], config: { mode: 'exact_auto_match', exactAutoMatch: true } }); assert.notEqual(result.candidates[0].classification, 'exact'); assert.equal(result.automaticMatches.length, 0) })
test('identidade externa confirmada pode ser exata e materializa apenas vínculo paralelo', () => { const externalTransactionId = 'bank-1', source = raw({ externalTransactionId }), target = financial({ externalTransactionId }); const result = runReconciliationEngine({ userId, rawTransactions: [source], financialTransactions: [target], config: { mode: 'exact_auto_match', exactAutoMatch: true } }); assert.equal(result.candidates[0].classification, 'exact'); assert.equal(result.automaticMatches.length, 1); const [match] = materializeExactAutomaticMatches({ engineResult: result, userId }); assert.equal(match.link.rawTransactionId, source.id); assert.equal(match.link.financialTransactionId, target.id) })
test('compras legítimas idênticas geram conflito e nunca automação', () => { const source = raw(), result = runReconciliationEngine({ userId, rawTransactions: [source], financialTransactions: [financial(), financial()], config: { mode: 'exact_auto_match', exactAutoMatch: true } }); assert.ok(result.candidates.every((item) => item.classification === 'conflict')); assert.equal(result.automaticMatches.length, 0) })
test('isola candidatos por usuário', () => { const result = runReconciliationEngine({ userId, rawTransactions: [raw()], financialTransactions: [financial({ userId: '00000000-0000-4000-8000-000000000002' })], config: { mode: 'observation' } }); assert.equal(result.candidates.length, 0) })
test('bloqueia pagamento de fatura, transferências, estorno e parcelas incompatíveis', () => {
  const cases = [
    [raw({ transactionKind: 'invoice-payment' }), financial(), 'INVOICE_PAYMENT_VS_PURCHASE'],
    [raw({ entityType: 'transfer', sourceAccountId: 'a1', destinationAccountId: 'a2' }), financial(), 'OWN_TRANSFER_VS_COMMON_TRANSACTION'],
    [raw({ amount: '10.00', description: 'Estorno mercado' }), financial(), 'REFUND_REQUIRES_REVERSAL_LINK'],
    [raw({ installmentGroupId: 'g', installmentNumber: 1 }), financial({ installmentGroupId: 'g', installmentNumber: 2 }), 'DIFFERENT_INSTALLMENTS'],
  ]
  for (const [source, target, code] of cases) assert.ok(evaluateBlockingRules({ features: extractReconciliationFeatures({ raw: source, financial: target }) }).includes(code))
})
