import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../.env', import.meta.url))

if (existsSync(path)) {
  console.log('El archivo .env ya existe; no se modificó.')
} else {
  const secret = () => randomBytes(32).toString('base64url')
  writeFileSync(path, `JWT_SECRET=${secret()}\nMFA_ENCRYPTION_KEY=${secret()}\nPORT=3001\nPUBLIC_BASE_URL=http://localhost:5173\n`, { mode: 0o600, flag: 'wx' })
  console.log('Se creó .env con claves locales aleatorias. Git lo ignora.')
}
