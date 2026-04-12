import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import './AppShell.css'

async function fetchAdminDashboard() {
  const { data: s } = await supabase
    .from('program_settings')
    .select('*')
    .limit(1)
    .maybeSingle()
  const { data: tokens } = await supabase
    .from('qr_tokens')
    .select('id,token,cantidad_sellos,created_at,canjes_realizados,max_canjes')
    .order('created_at', { ascending: false })
    .limit(8)
  return { settings: s, recent: tokens || [] }
}

export default function AdminDashboard() {
  const { profile, user, signOut } = useAuth()
  const [settings, setSettings] = useState(null)
  const [sellosPorCuponera, setSellosPorCuponera] = useState('10')
  const [cantidadSellos, setCantidadSellos] = useState('1')
  const [lastToken, setLastToken] = useState('')
  const [msg, setMsg] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    let alive = true
    fetchAdminDashboard().then(({ settings: s, recent: r }) => {
      if (!alive) return
      if (s) {
        setSettings(s)
        setSellosPorCuponera(String(s.sellos_por_cuponera))
      }
      setRecent(r)
    })
    return () => {
      alive = false
    }
  }, [])

  function refreshAdmin() {
    fetchAdminDashboard().then(({ settings: s, recent: r }) => {
      if (s) {
        setSettings(s)
        setSellosPorCuponera(String(s.sellos_por_cuponera))
      }
      setRecent(r)
    })
  }

  async function saveSettings(e) {
    e.preventDefault()
    setMsg(null)
    if (!settings?.id) {
      setMsg({ ok: false, text: 'No hay fila de configuración.' })
      return
    }
    const n = parseInt(sellosPorCuponera, 10)
    if (Number.isNaN(n) || n < 1) {
      setMsg({ ok: false, text: 'Cantidad inválida.' })
      return
    }
    const { error } = await supabase
      .from('program_settings')
      .update({ sellos_por_cuponera: n })
      .eq('id', settings.id)
    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }
    setMsg({ ok: true, text: 'Configuración guardada.' })
    refreshAdmin()
  }

  async function generarQr(e) {
    e.preventDefault()
    setMsg(null)
    const n = parseInt(cantidadSellos, 10)
    if (Number.isNaN(n) || n < 1) {
      setMsg({ ok: false, text: 'Cantidad de sellos inválida.' })
      return
    }
    const token = crypto.randomUUID()
    const { error } = await supabase.from('qr_tokens').insert({
      token,
      cantidad_sellos: n,
      creado_por: user.id,
    })
    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }
    setLastToken(token)
    setMsg({
      ok: true,
      text: 'Token generado. Úsalo en el QR o cópialo para la clienta.',
    })
    refreshAdmin()
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>AnnetEstudio — Admin</h1>
          <div className="meta">{profile?.email}</div>
        </div>
        <div className="row-actions">
          <Link to="/mi-tarjeta">Vista clienta</Link>
          <button type="button" className="ghost" onClick={() => signOut()}>
            Salir
          </button>
        </div>
      </header>

      <section>
        <h2>Sellos por cuponera</h2>
        <form onSubmit={saveSettings}>
          <input
            className="inline"
            type="number"
            min={1}
            value={sellosPorCuponera}
            onChange={(e) => setSellosPorCuponera(e.target.value)}
          />
          <button type="submit" className="primary">
            Guardar
          </button>
        </form>
      </section>

      <section>
        <h2>Generar código para QR</h2>
        <form onSubmit={generarQr}>
          <label className="meta" htmlFor="qty">
            Sellos que otorga este código
          </label>
          <input
            id="qty"
            className="inline"
            type="number"
            min={1}
            value={cantidadSellos}
            onChange={(e) => setCantidadSellos(e.target.value)}
          />
          <button type="submit" className="primary">
            Generar token
          </button>
        </form>
        {lastToken ? (
          <div className="card" style={{ marginTop: '0.75rem' }}>
            <div className="meta">Último token (contenido del QR):</div>
            <code
              style={{
                display: 'block',
                wordBreak: 'break-all',
                marginTop: '0.35rem',
                fontSize: '0.85rem',
              }}
            >
              {lastToken}
            </code>
          </div>
        ) : null}
      </section>

      {msg ? (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>
      ) : null}

      <section>
        <h2>Últimos códigos</h2>
        {recent.length === 0 ? (
          <p className="meta">Ninguno aún.</p>
        ) : (
          recent.map((r) => (
            <div key={r.id} className="card">
              <code style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {r.token}
              </code>
              <div className="meta">
                {r.cantidad_sellos} sello(s) · usos {r.canjes_realizados}/
                {r.max_canjes}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
