import test from 'node:test'
import assert from 'node:assert/strict'
import { applyExternalFieldUpdate } from '../src/domain/origin/fieldOwnership.js'

test('atualização externa muda campos do provedor e preserva enriquecimentos manuais', () => {
  const current = { description: 'Banco antigo', externalStatus: 'pending', amount: '10.00', category: 'Casa', notes: 'manual', tags: ['fixa'] }
  const result = applyExternalFieldUpdate({ current, incoming: { description: 'Banco corrigido', externalStatus: 'posted', amount: '10.00', category: 'Não substituir', notes: 'não substituir' } })
  assert.equal(result.value.description, 'Banco corrigido'); assert.equal(result.value.externalStatus, 'posted')
  assert.equal(result.value.category, 'Casa'); assert.equal(result.value.notes, 'manual'); assert.deepEqual(result.value.tags, ['fixa'])
  assert.deepEqual(result.changedFields.sort(), ['description', 'externalStatus'])
})
