import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'

const scryptAsync = promisify(scrypt)
const jwtSecret = Buffer.from(process.env.JWT_SECRET || '', 'base64url')
const encryptionKey = Buffer.from(process.env.MFA_ENCRYPTION_KEY || '', 'base64url')

if (jwtSecret.length !== 32 || encryptionKey.length !== 32) {
  throw new Error('Faltan JWT_SECRET o MFA_ENCRYPTION_KEY. Ejecuta npm run setup.')
}

const dummyHash = `scrypt$${Buffer.alloc(16).toString('hex')}$${Buffer.alloc(64).toString('hex')}`

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password, storedHash = dummyHash) {
  const [algorithm, saltHex, hashHex] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function newTotpSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes = randomBytes(20)
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31]
  return output
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let data = 0
  const bytes = []
  for (const character of value) {
    data = (data << 5) | alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((data >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function encryptSecret(secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

export function decryptSecret(value) {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function totpAtStep(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(value).padStart(6, '0')
}

export function verifyTotp(secret, code, lastStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const currentStep = Math.floor(now / 30_000)
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step <= lastStep || step < 0) continue
    if (timingSafeEqual(Buffer.from(totpAtStep(secret, step)), Buffer.from(code))) return step
  }
  return null
}

export function provisioningUri(email, secret) {
  return `otpauth://totp/${encodeURIComponent(`TechStore:${email}`)}?secret=${secret}&issuer=TechStore&algorithm=SHA1&digits=6&period=30`
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function signAccessToken(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuer('techstore')
    .setAudience('techstore-api')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(jwtSecret)
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, jwtSecret, { issuer: 'techstore', audience: 'techstore-api', algorithms: ['HS256'] })
  return Number(payload.sub)
}
