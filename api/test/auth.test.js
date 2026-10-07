import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { after, test } from 'node:test'

process.env.JWT_SECRET = randomBytes(32).toString('base64url')
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
process.env.TECHSTORE_DB_PATH = ':memory:'

const { app } = await import('../src/app.js')
const { verifyTotp } = await import('../src/security.js')
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
after(() => server.close())

async function request(path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, data: await response.json() }
}

function currentCode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const bytes = []
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

test('TOTP acepta el vector publicado en RFC 6238', () => {
  assert.equal(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', -1, 59_000), 1)
})

test('registro, MFA, JWT y bloqueo de intentos', async () => {
  const stores = await request('/api/stores')
  assert.equal(stores.status, 200)
  const email = 'prueba@example.com'
  const password = 'ClaveSegura1!'
  const registration = await request('/api/auth/register', {
    email, password, fullName: 'Persona de Prueba', storeId: stores.data[0].id, role: 'admin',
  })
  assert.equal(registration.status, 201)
  const secret = new URL(registration.data.setupUri).searchParams.get('secret')
  assert.equal((await request('/api/auth/me')).status, 401)

  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal((await request('/api/auth/mfa/verify', {
      challengeToken: registration.data.challengeToken, code: '000000',
    })).status, 401)
  }
  assert.equal((await request('/api/auth/mfa/verify', {
    challengeToken: registration.data.challengeToken, code: currentCode(secret),
  })).status, 401)

  const login = await request('/api/auth/login', { email, password })
  assert.equal(login.status, 200)
  const verified = await request('/api/auth/mfa/verify', {
    challengeToken: login.data.challengeToken, code: currentCode(secret),
  })
  assert.equal(verified.status, 200)
  assert.ok(verified.data.token)
  const me = await request('/api/auth/me', null, verified.data.token)
  assert.equal(me.data.role, 'employee')
  assert.equal((await request('/api/auth/mfa/verify', {
    challengeToken: login.data.challengeToken, code: currentCode(secret),
  })).status, 401)

  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await request('/api/auth/login', { email, password: 'Incorrecta1!' })).status, 401)
  }
  assert.equal((await request('/api/auth/login', { email, password })).status, 429)
})
