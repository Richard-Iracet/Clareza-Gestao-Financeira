import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('service worker limita cache a GET da mesma origem e exclui JSON', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(source, /request\.method !== 'GET'/)
  assert.match(source, /url\.origin !== self\.location\.origin/)
  assert.match(source, /endsWith\('\.json'\)/)
  assert.match(source, /request\.destination/)
  assert.doesNotMatch(source, /supabase\.co/)
})

test('manifesto PWA não bloqueia orientação', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.orientation, undefined)
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))
})
