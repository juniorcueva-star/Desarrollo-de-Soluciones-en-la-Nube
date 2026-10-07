import { database } from '../src/database.js'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Uso: npm run admin:promote --workspace api -- correo@ejemplo.com')
  process.exitCode = 1
} else {
  const user = database.prepare('SELECT id, mfa_enabled FROM users WHERE email = ?').get(email)
  if (!user || !user.mfa_enabled) {
    console.error('El usuario no existe o todavía no completó MFA.')
    process.exitCode = 1
  } else {
    database.prepare("UPDATE users SET role = 'admin', active = 1 WHERE id = ?").run(user.id)
    console.log(`Administrador activado: ${email}`)
  }
}
