import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { database } from './database.js'
import {
  decryptSecret, encryptSecret, hashPassword, hashToken, newTotpSecret,
  provisioningUri, signAccessToken, verifyAccessToken, verifyPassword, verifyTotp,
} from './security.js'

export const authRouter = Router()
const challengeLifetimeMs = 5 * 60 * 1000
const lockLifetimeMs = 15 * 60 * 1000

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    storeId: user.store_id,
    role: user.role,
    active: Boolean(user.active),
  }
}

export function createChallenge(userId, purpose) {
  const token = randomBytes(32).toString('base64url')
  database.prepare('DELETE FROM auth_challenges WHERE expires_at < ? OR consumed = 1').run(Date.now())
  database.prepare('INSERT INTO auth_challenges (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, purpose, Date.now() + challengeLifetimeMs)
  return token
}

authRouter.get('/stores', (_request, response) => {
  response.json(database.prepare('SELECT id, name FROM stores ORDER BY name').all())
})

authRouter.post('/auth/register', async (request, response) => {
  const { email, password, fullName, storeId } = request.body || {}
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedName = typeof fullName === 'string' ? fullName.trim() : ''
  const parsedStoreId = Number(storeId)

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return response.status(400).json({ error: 'Ingresa un correo válido.' })
  }
  if (normalizedName.length < 2 || normalizedName.length > 100) {
    return response.status(400).json({ error: 'Ingresa un nombre de 2 a 100 caracteres.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 ||
      !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return response.status(400).json({ error: 'La contraseña requiere 8 caracteres, mayúscula, número y carácter especial.' })
  }
  if (!Number.isInteger(parsedStoreId) || !database.prepare('SELECT id FROM stores WHERE id = ?').get(parsedStoreId)) {
    return response.status(400).json({ error: 'Selecciona una tienda válida.' })
  }
  if (database.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) {
    return response.status(409).json({ error: 'Este correo ya está registrado.' })
  }

  const secret = newTotpSecret()
  const passwordHash = await hashPassword(password)
  let result
  try {
    result = database.prepare(`
      INSERT INTO users (email, password_hash, full_name, store_id, totp_secret, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(normalizedEmail, passwordHash, normalizedName, parsedStoreId, encryptSecret(secret), Date.now())
  } catch (error) {
    if (error.code === 'ERR_SQLITE_ERROR' && error.message.includes('UNIQUE')) {
      return response.status(409).json({ error: 'Este correo ya está registrado.' })
    }
    throw error
  }

  response.status(201).json({
    challengeToken: createChallenge(result.lastInsertRowid, 'setup'),
    setupUri: provisioningUri(normalizedEmail, secret),
    message: 'Configura tu aplicación de códigos y confirma el primer código.',
  })
})

authRouter.post('/auth/login', async (request, response) => {
  const { email, password } = request.body || {}
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 128) {
    return response.status(400).json({ error: 'Ingresa correo y contraseña.' })
  }
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (user && user.locked_until > Date.now()) {
    return response.status(429).json({ error: 'Cuenta bloqueada temporalmente. Intenta en 15 minutos.' })
  }

  const passwordValid = await verifyPassword(password, user?.password_hash)
  if (!user || !passwordValid) {
    if (user) {
      const attempts = user.failed_attempts + 1
      database.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
        .run(attempts >= 5 ? 0 : attempts, attempts >= 5 ? Date.now() + lockLifetimeMs : 0, user.id)
    }
    return response.status(401).json({ error: 'Credenciales incorrectas.' })
  }

  database.prepare('UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(user.id)
  const purpose = user.mfa_enabled ? 'login' : 'setup'
  response.json({
    challengeToken: createChallenge(user.id, purpose),
    setupUri: purpose === 'setup' ? provisioningUri(user.email, decryptSecret(user.totp_secret)) : null,
    message: purpose === 'setup' ? 'Configura el segundo factor.' : 'Ingresa el código de tu aplicación.',
  })
})

authRouter.post('/auth/mfa/verify', async (request, response) => {
  const { challengeToken, code } = request.body || {}
  if (typeof challengeToken !== 'string' || typeof code !== 'string' || challengeToken.length > 100 || code.length > 20) {
    return response.status(400).json({ error: 'Ingresa el código de seis dígitos.' })
  }
  const challenge = database.prepare('SELECT * FROM auth_challenges WHERE token_hash = ?').get(hashToken(challengeToken))
  if (!challenge || challenge.consumed || challenge.expires_at < Date.now()) {
    return response.status(401).json({ error: 'El intento de acceso venció. Inicia sesión otra vez.' })
  }
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(challenge.user_id)
  const step = verifyTotp(decryptSecret(user.totp_secret), code, user.last_totp_step)
  if (step === null) {
    const attempts = challenge.attempts + 1
    database.prepare('UPDATE auth_challenges SET attempts = ?, consumed = ? WHERE id = ?')
      .run(attempts, attempts >= 3 ? 1 : 0, challenge.id)
    return response.status(401).json({ error: attempts >= 3 ? 'Tres intentos fallidos. Inicia sesión otra vez.' : 'Código incorrecto.' })
  }

  database.prepare('UPDATE auth_challenges SET consumed = 1 WHERE id = ?').run(challenge.id)
  database.prepare('UPDATE users SET mfa_enabled = 1, last_totp_step = ? WHERE id = ?').run(step, user.id)
  response.json({ token: await signAccessToken(user.id), user: publicUser(user) })
})

export async function authenticate(request, response, next) {
  const token = /^Bearer (.+)$/i.exec(request.headers.authorization || '')?.[1]
  if (!token) return response.status(401).json({ error: 'Inicia sesión para continuar.' })
  try {
    const userId = await verifyAccessToken(token)
    const user = database.prepare('SELECT * FROM users WHERE id = ? AND mfa_enabled = 1').get(userId)
    if (!user) return response.status(401).json({ error: 'Sesión inválida.' })
    request.user = user
    next()
  } catch {
    response.status(401).json({ error: 'Sesión inválida o vencida.' })
  }
}

authRouter.get('/auth/me', authenticate, (request, response) => {
  response.json(publicUser(request.user))
})
