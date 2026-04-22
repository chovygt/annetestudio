import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCallbackAlert from '../components/AuthCallbackAlert.jsx'
import AuthLayout from '../components/AuthLayout.jsx'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthErrorMessage } from '../lib/mapAuthErrorMessage.js'
import './AuthPages.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: err } = await signIn(email.trim(), password)
    setBusy(false)
    if (err) {
      setError(mapAuthErrorMessage(err.message))
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Tarjeta de fidelidad"
      visualImageSrc="/images/pampas-login.png"
      visualImageAlt=""
    >
      <div className="auth-page">
        <AuthCallbackAlert />
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="hint">
          ¿No tienes cuenta? <Link to="/registro">Crear cuenta</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
