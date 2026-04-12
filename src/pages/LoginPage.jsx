import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCallbackAlert from '../components/AuthCallbackAlert.jsx'
import { useAuth } from '../contexts/AuthContext'
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
      setError(err.message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="auth-page">
      <h1>AnnetEstudio</h1>
      <p className="sub">Iniciar sesión</p>
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
        ¿No tienes cuenta? <Link to="/registro">Registrarse</Link>
      </p>
    </div>
  )
}
