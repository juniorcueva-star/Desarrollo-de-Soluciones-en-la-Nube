import express from 'express'
import { database } from './database.js'
import { authRouter } from './auth.js'
import { inventoryRouter } from './inventory.js'

export const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

app.get('/api/health', (_request, response) => {
  const databaseReady = database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value === '3'
  response.json({ service: 'techstore-api', status: databaseReady ? 'ok' : 'error' })
})

app.use('/api', authRouter)
app.use('/api', inventoryRouter)

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Ocurrió un error interno.' })
})
