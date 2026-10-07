import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { after, test } from 'node:test'

process.env.JWT_SECRET = randomBytes(32).toString('base64url')
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
process.env.TECHSTORE_DB_PATH = ':memory:'

const { app } = await import('../src/app.js')
const { verifyTotp } = await import('../src/security.js')
const { database } = await import('../src/database.js')
const { createChallenge } = await import('../src/auth.js')
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
after(() => server.close())

async function request(path, body, token, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, data: response.status === 204 ? null : await response.json() }
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

async function registerVerified(email, storeId = 1) {
  const registration = await request('/api/auth/register', {
    email, password: 'ClaveSegura1!', fullName: email, storeId,
  })
  assert.equal(registration.status, 201)
  const secret = new URL(registration.data.setupUri).searchParams.get('secret')
  const verification = await request('/api/auth/mfa/verify', {
    challengeToken: registration.data.challengeToken, code: currentCode(secret),
  })
  assert.equal(verification.status, 200)
  return verification.data.token
}

test('permisos de tienda, existencias y reportes', async () => {
  const adminToken = await registerVerified('admin@example.com')
  database.prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'").run()
  const secondStore = await request('/api/stores', { name: 'Tienda Sur' }, adminToken)
  assert.equal(secondStore.status, 201)

  const managerToken = await registerVerified('gerente@example.com')
  const employeeToken = await registerVerified('ventas@example.com')
  const auditorToken = await registerVerified('auditor@example.com')
  database.prepare("UPDATE users SET role = 'manager' WHERE email = 'gerente@example.com'").run()
  database.prepare("UPDATE users SET role = 'auditor' WHERE email = 'auditor@example.com'").run()

  const ownProduct = await request('/api/products', {
    storeId: 1, sku: 'LAP-01', name: 'Laptop de prueba', priceCents: 250000, stock: 10,
  }, managerToken)
  assert.equal(ownProduct.status, 201)
  const otherProduct = await request('/api/products', {
    storeId: secondStore.data.id, sku: 'TAB-01', name: 'Tableta de prueba', priceCents: 50000, stock: 3,
  }, adminToken)
  assert.equal(otherProduct.status, 201)

  assert.equal((await request('/api/products', null, managerToken)).data.length, 1)
  assert.equal((await request('/api/products', null, auditorToken)).data.length, 2)
  assert.equal((await request(`/api/products/${otherProduct.data.id}`, null, managerToken, 'DELETE')).status, 403)
  assert.equal((await request(`/api/products/${ownProduct.data.id}`, {
    sku: 'LAP-01', name: 'Laptop alterada', priceCents: 1,
  }, employeeToken, 'PUT')).status, 403)
  const changedStock = await request(`/api/products/${ownProduct.data.id}/stock`, { delta: -2 }, employeeToken, 'PATCH')
  assert.equal(changedStock.data.stock, 8)
  assert.equal((await request(`/api/products/${ownProduct.data.id}/stock`, { delta: -100 }, employeeToken, 'PATCH')).status, 409)
  assert.equal((await request(`/api/products/${ownProduct.data.id}/stock`, { delta: 1 }, auditorToken, 'PATCH')).status, 403)
  assert.equal((await request('/api/reports/summary', null, managerToken)).data.productCount, 1)
  assert.equal((await request('/api/reports/summary', null, auditorToken)).data.productCount, 2)
  assert.equal((await request('/api/reports/summary', null, employeeToken)).status, 403)
})

test('OAuth prepara estado seguro y entrega el reto MFA', async () => {
  assert.deepEqual((await request('/api/oauth/available')).data, { google: false, github: false })
  process.env.GITHUB_CLIENT_ID = 'test-client'
  process.env.GITHUB_CLIENT_SECRET = 'test-secret'
  const start = await fetch(`${base}/api/oauth/github/start`, { redirect: 'manual' })
  assert.equal(start.status, 302)
  const authorization = new URL(start.headers.get('location'))
  assert.equal(authorization.hostname, 'github.com')
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(authorization.searchParams.get('state'))
  assert.ok(start.headers.get('set-cookie').includes('HttpOnly'))

  const user = database.prepare("SELECT id FROM users WHERE email = 'admin@example.com'").get()
  const challenge = createChallenge(user.id, 'setup')
  const finish = await fetch(`${base}/api/oauth/finish`, {
    headers: { Cookie: `techstore_oauth_pending=${challenge}` },
  })
  assert.equal(finish.status, 200)
  const result = await finish.json()
  assert.equal(result.challengeToken, challenge)
  assert.ok(result.setupUri.startsWith('otpauth://totp/'))
  delete process.env.GITHUB_CLIENT_ID
  delete process.env.GITHUB_CLIENT_SECRET
})
