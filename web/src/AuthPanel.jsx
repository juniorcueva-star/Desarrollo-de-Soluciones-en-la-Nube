import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.')
  return data
}

export default function AuthPanel({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [challenge, setChallenge] = useState(null)
  const [stores, setStores] = useState([])
  const [socialProviders, setSocialProviders] = useState({ google: false, github: false })
  const [form, setForm] = useState({ email: '', password: '', fullName: '', storeId: '' })
  const [code, setCode] = useState('')
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('oauth') === 'error' ? 'El acceso social no se completó. Intenta de nuevo.' : '')
  const [loading, setLoading] = useState(false)
  const oauthHandled = useRef(false)

  useEffect(() => {
    fetch('/api/stores')
      .then((response) => response.json())
      .then(setStores)
      .catch(() => setStores([]))
    fetch('/api/oauth/available')
      .then((response) => response.json())
      .then(setSocialProviders)
      .catch(() => setSocialProviders({ google: false, github: false }))
    const result = new URLSearchParams(window.location.search).get('oauth')
    if (oauthHandled.current) return
    oauthHandled.current = true
    if (result === 'complete') {
      fetch('/api/oauth/finish', { credentials: 'same-origin' })
        .then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'No se pudo completar el acceso social.')
          setChallenge(data)
        })
        .catch((requestError) => setError(requestError.message))
      window.history.replaceState({}, '', window.location.pathname)
    } else if (result === 'error') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submitCredentials(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await post(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        ...form,
        storeId: Number(form.storeId || stores[0]?.id),
      })
      setChallenge(data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function submitCode(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const session = await post('/api/auth/mfa/verify', {
        challengeToken: challenge.challengeToken,
        code: code.trim(),
      })
      onAuthenticated(session)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const setupSecret = challenge?.setupUri ? new URL(challenge.setupUri).searchParams.get('secret') : null

  return (
    <section className="auth-section" aria-labelledby="auth-title">
      <div className="auth-intro">
        <span className="eyebrow">Acceso seguro</span>
        <h2 id="auth-title">Ingresa a TechStore</h2>
        <p>Usa tu cuenta de empleado y completa el segundo factor para acceder al inventario.</p>
        <ul>
          <li>Contraseña validada y protegida con scrypt</li>
          <li>Bloqueo tras cinco intentos fallidos</li>
          <li>Código TOTP antes de emitir el JWT</li>
        </ul>
      </div>

      <div className="auth-card">
        {!challenge ? (
          <>
            <div className="auth-tabs" role="tablist" aria-label="Modo de acceso">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Ingresar</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Crear cuenta</button>
            </div>
            <form onSubmit={submitCredentials}>
              {mode === 'register' && (
                <>
                  <label>Nombre completo<input required minLength="2" maxLength="100" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} /></label>
                  <label>Tienda<select required value={form.storeId || stores[0]?.id || ''} onChange={(event) => update('storeId', event.target.value)}>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select></label>
                </>
              )}
              <label>Correo electrónico<input required type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
              <label>Contraseña<input required type="password" minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => update('password', event.target.value)} /></label>
              {mode === 'register' && <p className="field-hint">Mínimo 8 caracteres, con mayúscula, número y carácter especial.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={loading || (mode === 'register' && stores.length === 0)}>{loading ? 'Procesando…' : mode === 'register' ? 'Crear cuenta' : 'Continuar'}</button>
            </form>
            <div className="social-login">
              <p>También puedes continuar con:</p>
              <div>
                {socialProviders.google ? <a href="/api/oauth/google/start">Google</a> : <span>Google · pendiente</span>}
                {socialProviders.github ? <a href="/api/oauth/github/start">GitHub</a> : <span>GitHub · pendiente</span>}
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="eyebrow">Segundo factor</span>
            <h3>{setupSecret ? 'Configura tu autenticador' : 'Ingresa tu código'}</h3>
            {setupSecret && (
              <div className="qr-setup">
                <QRCodeSVG value={challenge.setupUri} size={156} marginSize={2} title="Código QR para configurar el autenticador" />
                <p>Configura el autenticador una sola vez para esta cuenta, incluso si ingresas con Google o GitHub. En los próximos accesos solo escribirás el código de 6 dígitos. Escanea el QR con Google Authenticator o una app compatible; también puedes ingresar esta clave manualmente:</p>
                <code>{setupSecret}</code>
              </div>
            )}
            <form onSubmit={submitCode}>
              <label>Código de 6 dígitos<input required inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={loading}>{loading ? 'Verificando…' : 'Verificar y entrar'}</button>
              <button className="text-button" type="button" onClick={() => { setChallenge(null); setCode(''); setError('') }}>Volver al inicio de sesión</button>
            </form>
          </>
        )}
      </div>
    </section>
  )
}
