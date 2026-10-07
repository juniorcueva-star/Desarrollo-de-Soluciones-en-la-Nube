import express from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { database } from './database.js'
import { authRouter } from './auth.js'
import { inventoryRouter } from './inventory.js'
import { oauthRouter } from './oauth.js'

export const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))
app.use('/api', (_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_request, response) => {
  const databaseReady = database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value === '4'
  response.json({ service: 'techstore-api', status: databaseReady ? 'ok' : 'error' })
})

app.use('/api', authRouter)
app.use('/api/oauth', oauthRouter)
app.use('/api', inventoryRouter)

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Ruta no encontrada.' })
})

if (process.env.NODE_ENV === 'production') {
  const webDirectory = fileURLToPath(new URL('../../web/dist/', import.meta.url))
  const indexFile = fileURLToPath(new URL('../../web/dist/index.html', import.meta.url))
  if (!existsSync(indexFile)) throw new Error('Falta web/dist. Ejecuta npm run build antes de iniciar.')
  app.use(express.static(webDirectory, { index: false }))
  app.use((request, response, next) => {
    if (request.method === 'GET') return response.sendFile(indexFile)
    next()
  })
}

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Ocurrió un error interno.' })
})
