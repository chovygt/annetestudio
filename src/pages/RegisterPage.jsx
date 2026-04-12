import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCallbackAlert from '../components/AuthCallbackAlert.jsx'
import { useAuth } from '../contexts/AuthContext'
import './AuthPages.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    const { data, error: err } = await signUp(
      email.trim(),
      password,
      nombre.trim()
    )
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    if (data?.session) {
      navigate('/', { replace: true })
      return
    }
    setInfo(
      'Revisa tu correo para confirmar la cuenta (si tienes confirmación por email activada en Supabase).'
    )
  }

  return (
    <div className="auth-page">
      <h1>AnnetEstudio</h1>
      <p className="sub">Crear cuenta</p>
      <AuthCallbackAlert />
      {error ? <div className="error">{error}</div> : null}
      {info ? <div className="error">{info}</div> : null}
      <form onSubmit={handleSubmit}>
        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          type="text"
          autoComplete="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
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
          autoComplete="new-password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Creando…' : 'Registrarse'}
        </button>
      </form>
      <p className="hint">
        ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
      </p>
    </div>
  )
}
