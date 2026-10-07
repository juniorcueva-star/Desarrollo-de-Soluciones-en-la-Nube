import express from 'express'
import { database } from './database.js'

const app = express()
const port = Number(process.env.PORT || 3001)

app.get('/api/health', (_request, response) => {
  const databaseReady = database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value === '1'
  response.json({ service: 'techstore-api', status: databaseReady ? 'ok' : 'error' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`TechStore API disponible en http://127.0.0.1:${port}`)
})
