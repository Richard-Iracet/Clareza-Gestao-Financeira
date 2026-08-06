import test from 'node:test'
import assert from 'node:assert/strict'
import { createPayloadHash, createTransactionFingerprint, normalizeMoney } from '../src/domain/origin/fingerprint.js'
import { receiveExternalVersion } from '../src/domain/origin/externalVersionService.js'

test('hash e fingerprint são determinísticos, versionados e preservam sinal monetário', async () => {
  assert.equal(normalizeMoney('-0010.2500'), '-10.25')
  assert.equal(await createPayloadHash({ b: 2, a: 1 }), await createPayloadHash({ a: 1, b: 2 }))
  const first = await createTransactionFingerprint({ description: '  MERCADO  ', amount: '-10.25', date: '2026-08-01', currency: 'brl' })
  const second = await createTransactionFingerprint({ description: 'mercado', amount: '-10.250', date: '2026-08-01', currency: 'BRL' })
  assert.equal(first.fingerprint, second.fingerprint); assert.equal(first.version, 1)
  const v2 = await createTransactionFingerprint({ description: 'mercado', amount: '-10.25', date: '2026-08-01' }, 2)
  assert.notEqual(first.fingerprint, v2.fingerprint)
})

test('payload igual não duplica versão; pending para posted preserva identidade e versão anterior', async () => {
  const identity = { id: crypto.randomUUID(), externalStatus: 'pending' }
  const pending = await receiveExternalVersion({ identity, payload: { id: 'p', status: 'pending' }, normalized: { externalStatus: 'pending', amount: '10.00', description: 'Compra' }, receivedAt: '2026-08-01T10:00:00.000Z' })
  const repeated = await receiveExternalVersion({ identity: pending.identity, versions: pending.versions, payload: { status: 'pending', id: 'p' }, normalized: { externalStatus: 'pending' } })
  assert.equal(repeated.created, false); assert.equal(repeated.versions.length, 1)
  const posted = await receiveExternalVersion({ identity: pending.identity, versions: pending.versions, payload: { id: 'posted-id', status: 'posted', description: 'Compra confirmada' }, normalized: { externalStatus: 'posted', amount: '10.00', description: 'Compra confirmada' }, receivedAt: '2026-08-02T10:00:00.000Z' })
  assert.equal(posted.identity.id, identity.id); assert.equal(posted.versions.length, 2); assert.equal(posted.versions[0].externalStatus, 'pending'); assert.equal(posted.version.supersedesVersionId, pending.version.id)
  assert.ok(posted.auditEvents.some((event) => event.eventType === 'external_status_changed'))
})
test('payload com segredo ou status desconhecido é recusado antes de persistência', async () => {
  const identity = { id: crypto.randomUUID() }
  await assert.rejects(() => receiveExternalVersion({ identity, payload: { access_token: 'não armazenar' }, normalized: { externalStatus: 'posted' } }), /campo sensível/)
  await assert.rejects(() => receiveExternalVersion({ identity, payload: { id: 'x' }, normalized: { externalStatus: 'invented' } }), /Status externo inválido/)
})
