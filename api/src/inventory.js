import { Router } from 'express'
import { authenticate } from './auth.js'
import { database } from './database.js'

export const inventoryRouter = Router()
inventoryRouter.use(authenticate)

const productColumns = `
  SELECT p.id, p.store_id AS storeId, s.name AS storeName, p.sku, p.name,
         p.price_cents AS priceCents, p.stock, p.created_at AS createdAt,
         p.updated_at AS updatedAt
  FROM products p JOIN stores s ON s.id = p.store_id
`
const roles = ['admin', 'manager', 'employee', 'auditor']

function allowed(response, user, permitted) {
  if (permitted.includes(user.role)) return true
  response.status(403).json({ error: 'Tu perfil no permite esta operación.' })
  return false
}

function idFrom(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function productForUser(request, response) {
  const id = idFrom(request.params.id)
  const product = id ? database.prepare(`${productColumns} WHERE p.id = ?`).get(id) : null
  if (!product) {
    response.status(404).json({ error: 'Producto no encontrado.' })
    return null
  }
  if (request.user.role !== 'admin' && request.user.role !== 'auditor' && product.storeId !== request.user.store_id) {
    response.status(403).json({ error: 'Producto fuera de tu tienda.' })
    return null
  }
  return product
}

inventoryRouter.get('/products', (request, response) => {
  const user = request.user
  const requestedStore = request.query.storeId ? idFrom(request.query.storeId) : null
  if (request.query.storeId && !requestedStore) return response.status(400).json({ error: 'Tienda inválida.' })
  const storeId = user.role === 'manager' || user.role === 'employee' ? user.store_id : requestedStore
  const products = storeId
    ? database.prepare(`${productColumns} WHERE p.store_id = ? ORDER BY p.name`).all(storeId)
    : database.prepare(`${productColumns} ORDER BY s.name, p.name`).all()
  response.json(products)
})

inventoryRouter.post('/products', (request, response) => {
  if (!allowed(response, request.user, ['admin', 'manager'])) return
  const { sku, name, priceCents, stock = 0 } = request.body || {}
  const storeId = request.user.role === 'manager' ? request.user.store_id : idFrom(request.body?.storeId)
  const cleanSku = typeof sku === 'string' ? sku.trim() : ''
  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (!storeId || !database.prepare('SELECT id FROM stores WHERE id = ?').get(storeId)) {
    return response.status(400).json({ error: 'Tienda inválida.' })
  }
  if (cleanSku.length < 2 || cleanSku.length > 40 || cleanName.length < 2 || cleanName.length > 120 ||
      !Number.isSafeInteger(priceCents) || priceCents < 0 || !Number.isSafeInteger(stock) || stock < 0) {
    return response.status(400).json({ error: 'Revisa SKU, nombre, precio y existencias.' })
  }
  try {
    const now = Date.now()
    const result = database.prepare(`
      INSERT INTO products (store_id, sku, name, price_cents, stock, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(storeId, cleanSku, cleanName, priceCents, stock, now, now)
    response.status(201).json(database.prepare(`${productColumns} WHERE p.id = ?`).get(result.lastInsertRowid))
  } catch (error) {
    if (error.message.includes('UNIQUE')) return response.status(409).json({ error: 'El SKU ya existe en esta tienda.' })
    throw error
  }
})

inventoryRouter.put('/products/:id', (request, response) => {
  if (!allowed(response, request.user, ['admin', 'manager'])) return
  const product = productForUser(request, response)
  if (!product) return
  const { sku, name, priceCents } = request.body || {}
  const cleanSku = typeof sku === 'string' ? sku.trim() : ''
  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (cleanSku.length < 2 || cleanSku.length > 40 || cleanName.length < 2 || cleanName.length > 120 ||
      !Number.isSafeInteger(priceCents) || priceCents < 0) {
    return response.status(400).json({ error: 'Revisa SKU, nombre y precio.' })
  }
  try {
    database.prepare('UPDATE products SET sku = ?, name = ?, price_cents = ?, updated_at = ? WHERE id = ?')
      .run(cleanSku, cleanName, priceCents, Date.now(), product.id)
    response.json(database.prepare(`${productColumns} WHERE p.id = ?`).get(product.id))
  } catch (error) {
    if (error.message.includes('UNIQUE')) return response.status(409).json({ error: 'El SKU ya existe en esta tienda.' })
    throw error
  }
})

inventoryRouter.patch('/products/:id/stock', (request, response) => {
  if (!allowed(response, request.user, ['admin', 'manager', 'employee'])) return
  const product = productForUser(request, response)
  if (!product) return
  const delta = request.body?.delta
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    return response.status(400).json({ error: 'Ingresa un cambio de existencias válido.' })
  }
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = database.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND stock + ? >= 0')
      .run(delta, Date.now(), product.id, delta)
    if (result.changes === 0) {
      database.exec('ROLLBACK')
      return response.status(409).json({ error: 'No hay existencias suficientes.' })
    }
    database.prepare('INSERT INTO stock_events (product_id, user_id, delta, created_at) VALUES (?, ?, ?, ?)')
      .run(product.id, request.user.id, delta, Date.now())
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  response.json(database.prepare(`${productColumns} WHERE p.id = ?`).get(product.id))
})

inventoryRouter.delete('/products/:id', (request, response) => {
  if (!allowed(response, request.user, ['admin', 'manager'])) return
  const product = productForUser(request, response)
  if (!product) return
  database.prepare('DELETE FROM products WHERE id = ?').run(product.id)
  response.status(204).end()
})

inventoryRouter.get('/reports/summary', (request, response) => {
  if (!allowed(response, request.user, ['admin', 'manager', 'auditor'])) return
  const storeId = request.user.role === 'manager' ? request.user.store_id :
    (request.query.storeId ? idFrom(request.query.storeId) : null)
  if (request.query.storeId && !storeId) return response.status(400).json({ error: 'Tienda inválida.' })
  const where = storeId ? 'WHERE store_id = ?' : ''
  const statement = database.prepare(`
    SELECT COUNT(*) AS productCount, COALESCE(SUM(stock), 0) AS totalUnits,
           COALESCE(SUM(stock * price_cents), 0) AS inventoryValueCents,
           COALESCE(SUM(CASE WHEN stock < 5 THEN 1 ELSE 0 END), 0) AS lowStockCount
    FROM products ${where}
  `)
  response.json(storeId ? statement.get(storeId) : statement.get())
})

inventoryRouter.get('/users', (request, response) => {
  if (!allowed(response, request.user, ['admin'])) return
  response.json(database.prepare(`
    SELECT u.id, u.email, u.full_name AS fullName, u.role, u.store_id AS storeId,
           s.name AS storeName, u.mfa_enabled AS mfaEnabled
    FROM users u JOIN stores s ON s.id = u.store_id ORDER BY u.id
  `).all())
})

inventoryRouter.patch('/users/:id', (request, response) => {
  if (!allowed(response, request.user, ['admin'])) return
  const id = idFrom(request.params.id)
  const target = id ? database.prepare('SELECT * FROM users WHERE id = ?').get(id) : null
  if (!target) return response.status(404).json({ error: 'Usuario no encontrado.' })
  const role = request.body?.role || target.role
  const storeId = request.body?.storeId ? idFrom(request.body.storeId) : target.store_id
  if (!roles.includes(role) || !storeId || !database.prepare('SELECT id FROM stores WHERE id = ?').get(storeId)) {
    return response.status(400).json({ error: 'Rol o tienda inválidos.' })
  }
  if (target.role === 'admin' && role !== 'admin' &&
      database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count === 1) {
    return response.status(409).json({ error: 'Debe existir al menos un administrador.' })
  }
  database.prepare('UPDATE users SET role = ?, store_id = ? WHERE id = ?').run(role, storeId, id)
  response.json({ id, role, storeId })
})

inventoryRouter.post('/stores', (request, response) => {
  if (!allowed(response, request.user, ['admin'])) return
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
  if (name.length < 2 || name.length > 80) return response.status(400).json({ error: 'Nombre de tienda inválido.' })
  try {
    const result = database.prepare('INSERT INTO stores (name) VALUES (?)').run(name)
    response.status(201).json({ id: result.lastInsertRowid, name })
  } catch (error) {
    if (error.message.includes('UNIQUE')) return response.status(409).json({ error: 'La tienda ya existe.' })
    throw error
  }
})
