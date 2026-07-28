import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const serviceWorkerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')

const createHarness = ({ fetchResponse, putError, operations = [] } = {}) => {
  const listeners = {}
  const caches = {
    match: async () => null,
    open: async () => {
      operations.push('open')
      return {
        addAll: async () => {},
        put: async () => {
          operations.push('put')
          if (putError) throw putError
        },
      }
    },
    keys: async () => ['clareza-shell-v1', 'outro-cache'],
    delete: async (key) => { operations.push(`delete:${key}`); return true },
  }
  const self = {
    location: { origin: 'https://app.example.com' },
    clients: { claim: async () => { operations.push('claim') } },
    skipWaiting: async () => { operations.push('skipWaiting') },
    addEventListener: (type, listener) => { listeners[type] = listener },
  }
  const fetch = async () => {
    operations.push('fetch')
    return fetchResponse
  }
  vm.runInNewContext(serviceWorkerSource, { self, caches, fetch, URL, Set, console: { warn: () => {} } })
  return { listeners, operations }
}

const dispatchFetch = async (listener, request) => {
  let responsePromise
  listener({
    request,
    respondWith: (promise) => { responsePromise = promise },
  })
  return { intercepted: Boolean(responsePromise), response: responsePromise ? await responsePromise : undefined }
}

test('service worker não intercepta Supabase, endpoints sensíveis ou métodos não GET', async () => {
  const { listeners } = createHarness()
  const requests = [
    { url: 'https://abc.supabase.co/rest/v1/finance_states', method: 'GET', mode: 'cors', destination: '' },
    { url: 'https://app.example.com/auth/v1/token', method: 'GET', mode: 'cors', destination: '' },
    { url: 'https://app.example.com/rest/v1/data', method: 'GET', mode: 'cors', destination: '' },
    { url: 'https://app.example.com/realtime/v1/websocket', method: 'GET', mode: 'cors', destination: '' },
    { url: 'https://app.example.com/storage/v1/object', method: 'GET', mode: 'cors', destination: '' },
    { url: 'https://app.example.com/assets/app.js', method: 'POST', mode: 'cors', destination: 'script' },
  ]
  for (const request of requests) {
    assert.equal((await dispatchFetch(listeners.fetch, request)).intercepted, false)
  }
})

test('asset estático é clonado antes do cache e falha no cache não quebra a resposta', async () => {
  const operations = []
  const response = {
    status: 200,
    type: 'basic',
    bodyUsed: false,
    clone() {
      operations.push('clone')
      assert.equal(this.bodyUsed, false)
      return { cloneOf: 'response' }
    },
  }
  const harness = createHarness({ fetchResponse: response, putError: new Error('quota'), operations })
  const result = await dispatchFetch(harness.listeners.fetch, {
    url: 'https://app.example.com/assets/app.js',
    method: 'GET',
    mode: 'cors',
    destination: 'script',
  })
  assert.equal(result.intercepted, true)
  assert.equal(result.response, response)
  assert.deepEqual(operations, ['fetch', 'clone', 'open', 'put'])
})

test('respostas não 200 e opaque nunca são clonadas nem armazenadas', async () => {
  for (const response of [
    { status: 404, type: 'basic', bodyUsed: false, clone: () => assert.fail('não deveria clonar') },
    { status: 200, type: 'opaque', bodyUsed: false, clone: () => assert.fail('não deveria clonar') },
  ]) {
    const harness = createHarness({ fetchResponse: response })
    const result = await dispatchFetch(harness.listeners.fetch, {
      url: 'https://app.example.com/assets/app.js',
      method: 'GET',
      mode: 'cors',
      destination: 'script',
    })
    assert.equal(result.response, response)
    assert.equal(harness.operations.includes('put'), false)
  }
})

test('instalação ativa imediatamente e activate remove cache antigo e assume clientes', async () => {
  const harness = createHarness()
  let installPromise
  harness.listeners.install({ waitUntil: (promise) => { installPromise = promise } })
  await installPromise
  assert.ok(harness.operations.includes('skipWaiting'))

  let activatePromise
  harness.listeners.activate({ waitUntil: (promise) => { activatePromise = promise } })
  await activatePromise
  assert.ok(harness.operations.includes('delete:clareza-shell-v1'))
  assert.ok(harness.operations.includes('claim'))
  assert.match(serviceWorkerSource, /clareza-shell-v2/)
})

test('manifesto e metatags móveis permanecem compatíveis', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.orientation, undefined)
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))
  assert.match(html, /name="mobile-web-app-capable" content="yes"/)
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
})
