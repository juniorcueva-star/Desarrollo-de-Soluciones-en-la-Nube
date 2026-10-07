import { useEffect, useState } from 'react'
import AuthPanel from './AuthPanel.jsx'
import Dashboard from './Dashboard.jsx'
import './App.css'

const stages = [
  { number: '01', title: 'Cuentas seguras', detail: 'Registro, bloqueo de intentos y autenticación de dos factores.' },
  { number: '02', title: 'Inventario', detail: 'Productos y existencias organizados por tienda.' },
  { number: '03', title: 'Permisos', detail: 'Acceso para administrador, gerente, ventas y auditor.' },
  { number: '04', title: 'Acceso externo', detail: 'Inicio de sesión con Google y GitHub.' },
]

function App() {
  const [apiStatus, setApiStatus] = useState('checking')
  const [session, setSession] = useState(null)

  async function checkApi() {
    setApiStatus('checking')
    try {
      const response = await fetch('/api/health')
      const result = await response.json()
      setApiStatus(response.ok && result.status === 'ok' ? 'online' : 'offline')
    } catch {
      setApiStatus('offline')
    }
  }

  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => {
        const result = await response.json()
        setApiStatus(response.ok && result.status === 'ok' ? 'online' : 'offline')
      })
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="TechStore, inicio">
          <span className="brand-mark">T</span>
          <span>TechStore</span>
        </a>
        <span className="header-label">Laboratorio 8 · Desarrollo en la nube</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">Proyecto en construcción</span>
            <h1 id="hero-title">Inventario claro. Acceso seguro.</h1>
            <p>
              Sistema centralizado para las tiendas TechStore. Esta primera versión
              comprueba que la interfaz, la API y la base de datos funcionan en esta laptop.
            </p>
            <div className="status-card">
              <span className={`status-dot ${apiStatus}`} aria-hidden="true" />
              <div>
                <strong>Estado de la API</strong>
                <span aria-live="polite">
                  {apiStatus === 'online' && 'Conectada a SQLite'}
                  {apiStatus === 'offline' && 'Sin conexión. Inicia la API en otra terminal.'}
                  {apiStatus === 'checking' && 'Comprobando conexión…'}
                </span>
              </div>
              <button type="button" onClick={checkApi}>Revisar</button>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-grid" />
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-center">TS</div>
            <div className="art-chip chip-one">TIENDA</div>
            <div className="art-chip chip-two">STOCK</div>
            <div className="art-chip chip-three">ACCESO</div>
          </div>
        </section>

        {session?.user.active ? (
          <Dashboard session={session} onLogout={() => setSession(null)} />
        ) : session ? (
          <section className="pending-account">
            <span className="eyebrow">Cuenta protegida</span>
            <h2>Tu cuenta espera activación</h2>
            <p>Completaste el segundo factor. Un administrador debe asignarte acceso antes de usar el inventario. Después de la activación, vuelve a iniciar sesión.</p>
            <button className="outline-button" type="button" onClick={() => setSession(null)}>Cerrar sesión</button>
          </section>
        ) : <AuthPanel onAuthenticated={setSession} />}

        <section className="roadmap" aria-labelledby="roadmap-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Próximas etapas</span>
              <h2 id="roadmap-title">Lo que construiremos</h2>
            </div>
            <p>Avanzaremos por funcionalidades pequeñas, verificadas y guardadas en Git.</p>
          </div>
          <div className="stage-grid">
            {stages.map((stage) => (
              <article className="stage-card" key={stage.number}>
                <span>{stage.number}</span>
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">TechStore · Proyecto académico</footer>
    </div>
  )
}

export default App
