import { useEffect, useState } from 'react'

const roleNames = { admin: 'Administrador', manager: 'Gerente', employee: 'Ventas', auditor: 'Auditor' }
const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })

async function api(path, token, method = 'GET', body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 204) return null
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.')
  return data
}

function loadDashboard(token, canSeeReports, isAdmin) {
  return Promise.all([
    api('/products', token),
    canSeeReports ? api('/reports/summary', token) : Promise.resolve(null),
    fetch('/api/stores').then((response) => response.json()),
    isAdmin ? api('/users', token) : Promise.resolve([]),
  ])
}

export default function Dashboard({ session, onLogout }) {
  const { token, user } = session
  const canManageProducts = ['admin', 'manager'].includes(user.role)
  const canChangeStock = user.role !== 'auditor'
  const canSeeReports = user.role !== 'employee'
  const isAdmin = user.role === 'admin'
  const [products, setProducts] = useState([])
  const [summary, setSummary] = useState(null)
  const [stores, setStores] = useState([])
  const [users, setUsers] = useState([])
  const [userEdits, setUserEdits] = useState({})
  const [productForm, setProductForm] = useState({ id: null, storeId: user.storeId, sku: '', name: '', price: '', stock: '0' })
  const [newStore, setNewStore] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const [nextProducts, nextSummary, nextStores, nextUsers] = await loadDashboard(token, canSeeReports, isAdmin)
    setProducts(nextProducts)
    setSummary(nextSummary)
    setStores(nextStores)
    setUsers(nextUsers)
  }

  useEffect(() => {
    let active = true
    loadDashboard(token, canSeeReports, isAdmin)
      .then(([nextProducts, nextSummary, nextStores, nextUsers]) => {
        if (!active) return
        setProducts(nextProducts)
        setSummary(nextSummary)
        setStores(nextStores)
        setUsers(nextUsers)
      })
      .catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [token, canSeeReports, isAdmin])

  async function run(action, success) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      await refresh()
      setMessage(success)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function resetProductForm() {
    setProductForm({ id: null, storeId: user.storeId, sku: '', name: '', price: '', stock: '0' })
  }

  function submitProduct(event) {
    event.preventDefault()
    const priceCents = Math.round(Number(productForm.price) * 100)
    const body = {
      storeId: Number(productForm.storeId), sku: productForm.sku, name: productForm.name,
      priceCents, stock: Number(productForm.stock),
    }
    run(async () => {
      await api(productForm.id ? `/products/${productForm.id}` : '/products', token, productForm.id ? 'PUT' : 'POST', body)
      resetProductForm()
    }, productForm.id ? 'Producto actualizado.' : 'Producto creado.')
  }

  function editProduct(product) {
    setProductForm({ id: product.id, storeId: product.storeId, sku: product.sku, name: product.name, price: (product.priceCents / 100).toFixed(2), stock: String(product.stock) })
    document.getElementById('product-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  function deleteProduct(product) {
    if (!window.confirm(`¿Eliminar ${product.name}?`)) return
    run(() => api(`/products/${product.id}`, token, 'DELETE'), 'Producto eliminado.')
  }

  function changeStock(product, delta) {
    run(() => api(`/products/${product.id}/stock`, token, 'PATCH', { delta }), 'Existencias actualizadas.')
  }

  function saveUser(target) {
    const edit = userEdits[target.id] || {}
    run(() => api(`/users/${target.id}`, token, 'PATCH', {
      role: edit.role || target.role,
      storeId: Number(edit.storeId || target.storeId),
    }), 'Usuario actualizado.')
  }

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard-head">
        <div>
          <span className="eyebrow">Sesión verificada con MFA</span>
          <h2 id="dashboard-title">Hola, {user.fullName}</h2>
          <p>Perfil: {roleNames[user.role]}. Los permisos se comprueban en la API.</p>
        </div>
        <button className="outline-button" type="button" onClick={onLogout}>Cerrar sesión</button>
      </div>

      {message && <p className="dashboard-message" role="status">{message}</p>}

      {summary && (
        <div className="summary-grid" aria-label="Resumen de inventario">
          <div><span>Productos</span><strong>{summary.productCount}</strong></div>
          <div><span>Unidades</span><strong>{summary.totalUnits}</strong></div>
          <div><span>Valor del inventario</span><strong>{money.format(summary.inventoryValueCents / 100)}</strong></div>
          <div><span>Stock bajo</span><strong>{summary.lowStockCount}</strong></div>
        </div>
      )}

      <div className="dashboard-section-head">
        <div><span className="eyebrow">Inventario</span><h3>Productos</h3></div>
        <button className="outline-button" type="button" onClick={() => run(async () => {}, 'Datos actualizados.')} disabled={busy}>Actualizar</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tienda</th><th>SKU</th><th>Producto</th><th>Precio</th><th>Existencias</th><th>Acciones</th></tr></thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.storeName}</td><td>{product.sku}</td><td>{product.name}</td>
                <td>{money.format(product.priceCents / 100)}</td><td>{product.stock}</td>
                <td className="row-actions">
                  {canChangeStock && <><button type="button" disabled={busy} onClick={() => changeStock(product, -1)} aria-label={`Restar una unidad a ${product.name}`}>−1</button><button type="button" disabled={busy} onClick={() => changeStock(product, 1)} aria-label={`Sumar una unidad a ${product.name}`}>+1</button></>}
                  {canManageProducts && <><button type="button" onClick={() => editProduct(product)}>Editar</button><button type="button" disabled={busy} onClick={() => deleteProduct(product)}>Eliminar</button></>}
                  {user.role === 'auditor' && <span>Solo lectura</span>}
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan="6" className="empty-row">Todavía no hay productos en esta vista.</td></tr>}
          </tbody>
        </table>
      </div>

      {canManageProducts && (
        <div className="management-grid">
          <form id="product-form" className="management-card" onSubmit={submitProduct}>
            <h3>{productForm.id ? 'Editar producto' : 'Nuevo producto'}</h3>
            {isAdmin && <label>Tienda<select value={productForm.storeId} onChange={(event) => setProductForm({ ...productForm, storeId: event.target.value })}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
            <label>SKU<input required minLength="2" maxLength="40" value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>
            <label>Nombre<input required minLength="2" maxLength="120" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            <label>Precio en soles<input required type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label>
            {!productForm.id && <label>Existencias iniciales<input required type="number" min="0" step="1" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></label>}
            <button className="primary-button" disabled={busy}>{productForm.id ? 'Guardar cambios' : 'Crear producto'}</button>
            {productForm.id && <button className="text-button" type="button" onClick={resetProductForm}>Cancelar edición</button>}
          </form>
          <div className="management-note"><span className="eyebrow">Permisos</span><h3>Control por perfil</h3><p>El gerente administra productos de su tienda. Ventas modifica existencias sin acceder al precio. El auditor consulta todos los datos y reportes sin modificarlos.</p></div>
        </div>
      )}

      {isAdmin && (
        <div className="admin-area">
          <div className="dashboard-section-head"><div><span className="eyebrow">Administración</span><h3>Usuarios y tiendas</h3></div></div>
          <form className="store-form" onSubmit={(event) => { event.preventDefault(); run(async () => { await api('/stores', token, 'POST', { name: newStore }); setNewStore('') }, 'Tienda creada.') }}>
            <label>Nueva tienda<input required minLength="2" maxLength="80" value={newStore} onChange={(event) => setNewStore(event.target.value)} /></label>
            <button className="outline-button" disabled={busy}>Crear tienda</button>
          </form>
          <div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Perfil</th><th>Tienda</th><th></th></tr></thead><tbody>
            {users.map((target) => (
              <tr key={target.id}>
                <td>{target.fullName}</td><td>{target.email}</td>
                <td><select aria-label={`Perfil de ${target.fullName}`} value={userEdits[target.id]?.role || target.role} onChange={(event) => setUserEdits({ ...userEdits, [target.id]: { ...userEdits[target.id], role: event.target.value } })}>{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td><select aria-label={`Tienda de ${target.fullName}`} value={userEdits[target.id]?.storeId || target.storeId} onChange={(event) => setUserEdits({ ...userEdits, [target.id]: { ...userEdits[target.id], storeId: event.target.value } })}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></td>
                <td><button className="outline-button" type="button" disabled={busy} onClick={() => saveUser(target)}>Guardar</button></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
    </section>
  )
}
