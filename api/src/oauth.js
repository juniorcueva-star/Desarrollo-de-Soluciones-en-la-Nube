import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createChallenge } from './auth.js'
import { database } from './database.js'
import { decryptSecret, encryptSecret, hashPassword, hashToken, newTotpSecret, provisioningUri } from './security.js'

export const oauthRouter = Router()
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const stateLifetimeMs = 5 * 60 * 1000

function publicBase() {
  const value = process.env.PUBLIC_BASE_URL || 'http://localhost:5173'
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('PUBLIC_BASE_URL inválida')
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_BASE_URL debe usar HTTPS en producción')
  }
  return url.origin
}

function providerConfig(provider) {
  if (provider === 'google' && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'openid email profile',
    }
  }
  if (provider === 'github' && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    return {
      id: process.env.GITHUB_CLIENT_ID,
      secret: process.env.GITHUB_CLIENT_SECRET,
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'read:user user:email',
    }
  }
  return null
}

function callbackUrl(provider) {
  return `${publicBase()}/api/oauth/${provider}/callback`
}

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: publicBase().startsWith('https:'), path: '/api/oauth' }
}

function readCookie(request, name) {
  return (request.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

function sameRandomValue(a, b) {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

async function exchangeCode(provider, config, code, verifier) {
  const body = new URLSearchParams({
    client_id: config.id,
    client_secret: config.secret,
    code,
    redirect_uri: callbackUrl(provider),
    code_verifier: verifier,
  })
  if (provider === 'google') body.set('grant_type', 'authorization_code')
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error('No se pudo intercambiar el código OAuth.')
  return data
}

async function profileFromGoogle(tokens, clientId) {
  if (!tokens.id_token) throw new Error('Google no devolvió un token de identidad.')
  const { payload } = await jwtVerify(tokens.id_token, googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  })
  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    throw new Error('Google no confirmó el correo electrónico.')
  }
  return { id: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || payload.email) }
}

async function githubGet(path, accessToken) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'TechStore-Lab' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('GitHub no confirmó la identidad.')
  return response.json()
}

async function profileFromGithub(tokens) {
  const [profile, emails] = await Promise.all([
    githubGet('/user', tokens.access_token),
    githubGet('/user/emails', tokens.access_token),
  ])
  const email = emails.find((entry) => entry.primary && entry.verified) || emails.find((entry) => entry.verified)
  if (!profile.id || !email?.email) throw new Error('GitHub no confirmó un correo electrónico.')
  return { id: String(profile.id), email: email.email.toLowerCase(), name: String(profile.name || profile.login || email.email) }
}

async function findOrCreateUser(provider, profile) {
  const identity = database.prepare('SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?')
    .get(provider, profile.id)
  if (identity) return database.prepare('SELECT * FROM users WHERE id = ?').get(identity.user_id)

  let user = database.prepare('SELECT * FROM users WHERE email = ?').get(profile.email)
  if (!user) {
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
    const result = database.prepare(`
      INSERT INTO users (email, password_hash, full_name, store_id, totp_secret, created_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(profile.email, passwordHash, profile.name.slice(0, 100), encryptSecret(newTotpSecret()), Date.now())
    user = database.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
  }
  database.prepare('INSERT OR IGNORE INTO oauth_identities (provider, provider_user_id, user_id) VALUES (?, ?, ?)')
    .run(provider, profile.id, user.id)
  return user
}

oauthRouter.get('/available', (_request, response) => {
  response.json({ google: Boolean(providerConfig('google')), github: Boolean(providerConfig('github')) })
})

oauthRouter.get('/finish', (request, response) => {
  const token = readCookie(request, 'techstore_oauth_pending')
  response.clearCookie('techstore_oauth_pending', cookieOptions())
  const challenge = token ? database.prepare('SELECT * FROM auth_challenges WHERE token_hash = ?').get(hashToken(token)) : null
  if (!challenge || challenge.consumed || challenge.expires_at < Date.now()) {
    return response.status(401).json({ error: 'El acceso social venció. Intenta de nuevo.' })
  }
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(challenge.user_id)
  response.json({
    challengeToken: token,
    setupUri: challenge.purpose === 'setup' ? provisioningUri(user.email, decryptSecret(user.totp_secret)) : null,
  })
})

oauthRouter.get('/:provider/start', (request, response) => {
  const { provider } = request.params
  const config = providerConfig(provider)
  if (!config) return response.status(503).json({ error: 'Este proveedor todavía no está configurado.' })
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  database.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now())
  database.prepare('INSERT INTO oauth_states (state_hash, provider, code_verifier, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(state), provider, verifier, Date.now() + stateLifetimeMs)
  response.cookie('techstore_oauth_state', state, { ...cookieOptions(), maxAge: stateLifetimeMs })
  const url = new URL(config.authorizationUrl)
  url.search = new URLSearchParams({
    client_id: config.id,
    redirect_uri: callbackUrl(provider),
    response_type: 'code',
    scope: config.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  response.redirect(url.href)
})

oauthRouter.get('/:provider/callback', async (request, response) => {
  const { provider } = request.params
  const config = providerConfig(provider)
  const state = typeof request.query.state === 'string' ? request.query.state : ''
  const cookieState = readCookie(request, 'techstore_oauth_state')
  response.clearCookie('techstore_oauth_state', cookieOptions())
  const saved = state ? database.prepare('SELECT * FROM oauth_states WHERE state_hash = ?').get(hashToken(state)) : null
  if (saved) database.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(hashToken(state))
  if (!config || !saved || saved.provider !== provider || saved.expires_at < Date.now() ||
      !sameRandomValue(state, cookieState) || typeof request.query.code !== 'string') {
    return response.redirect(`${publicBase()}/?oauth=error`)
  }

  try {
    const tokens = await exchangeCode(provider, config, request.query.code, saved.code_verifier)
    const profile = provider === 'google'
      ? await profileFromGoogle(tokens, config.id)
      : await profileFromGithub(tokens)
    const user = await findOrCreateUser(provider, profile)
    const token = createChallenge(user.id, user.mfa_enabled ? 'login' : 'setup')
    response.cookie('techstore_oauth_pending', token, { ...cookieOptions(), maxAge: stateLifetimeMs })
    response.redirect(`${publicBase()}/?oauth=complete`)
  } catch (error) {
    console.error('Error OAuth:', error)
    response.redirect(`${publicBase()}/?oauth=error`)
  }
})
