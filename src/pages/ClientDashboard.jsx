import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import './AppShell.css'

async function fetchClientDashboard() {
  const [cRes, tRes, sRes] = await Promise.all([
    supabase
      .from('cuponeras')
      .select('*')
      .order('numero_secuencia', { ascending: true }),
    supabase
      .from('reward_tiers')
      .select('*')
      .eq('activo', true)
      .order('orden', { ascending: true }),
    supabase.from('program_settings').select('*').limit(1).maybeSingle(),
  ])
  return {
    cuponeras: cRes.error ? [] : cRes.data || [],
    tiers: tRes.error ? [] : tRes.data || [],
    settings: sRes.error ? null : sRes.data,
  }
}

export default function ClientDashboard() {
  const { profile, signOut } = useAuth()
  const [cuponeras, setCuponeras] = useState([])
  const [tiers, setTiers] = useState([])
  const [settings, setSettings] = useState(null)
  const [tokenInput, setTokenInput] = useState('')
  const [redeemMsg, setRedeemMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchClientDashboard().then(({ cuponeras: c, tiers: t, settings: s }) => {
      if (!alive) return
      setCuponeras(c)
      setTiers(t)
      setSettings(s)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  function refreshDashboard() {
    fetchClientDashboard().then(({ cuponeras: c, tiers: t, settings: s }) => {
      setCuponeras(c)
      setTiers(t)
      setSettings(s)
    })
  }

  async function handleRedeem(e) {
    e.preventDefault()
    setRedeemMsg(null)
    const t = tokenInput.trim()
    if (!t) return
    const { data, error } = await supabase.rpc('redeem_qr_token', {
      p_token: t,
    })
    if (error) {
      setRedeemMsg({ ok: false, text: error.message })
      return
    }
    if (data?.ok === false) {
      const key = data.error || 'error'
      const map = {
        no_autenticado: 'Inicia sesión de nuevo.',
        solo_clientas: 'Solo las clientas pueden canjear sellos.',
        token_invalido: 'Código no válido.',
        token_expirado: 'Este código ya expiró.',
        token_agotado: 'Este código ya fue usado.',
        sin_configuracion: 'Falta configuración del programa.',
      }
      setRedeemMsg({ ok: false, text: map[key] || key })
      return
    }
    setRedeemMsg({ ok: true, text: `Se agregaron ${data.sellos_otorgados} sello(s).` })
    setTokenInput('')
    refreshDashboard()
  }

  const activa = cuponeras.find((c) => c.estado === 'activa')

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>AnnetEstudio</h1>
          <div className="meta">
            {profile?.nombre || profile?.email} · Clienta
          </div>
        </div>
        <button type="button" className="ghost" onClick={() => signOut()}>
          Salir
        </button>
      </header>

      <section>
        <h2>Canjear sello (código del QR)</h2>
        <form onSubmit={handleRedeem}>
          <input
            className="inline"
            placeholder="Pega el token del QR"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button type="submit" className="primary">
            Canjear
          </button>
        </form>
        {redeemMsg ? (
          <p className={`msg ${redeemMsg.ok ? 'ok' : 'err'}`}>{redeemMsg.text}</p>
        ) : null}
      </section>

      <section>
        <h2>Tus cuponeras</h2>
        {loading ? (
          <p className="meta">Cargando…</p>
        ) : cuponeras.length === 0 ? (
          <p className="meta">
            Aún no tienes sellos. Canjea un código que te dé el salón.
          </p>
        ) : (
          cuponeras.map((c) => (
            <div key={c.id} className="card">
              <strong>Cuponera #{c.numero_secuencia}</strong> — {c.estado}
              <br />
              Sellos: {c.sellos_actuales} / {c.meta_sellos}
            </div>
          ))
        )}
      </section>

      {activa ? (
        <section>
          <h2>Descuentos según sellos (esta cuponera)</h2>
          <p className="meta">
            Llevas <strong>{activa.sellos_actuales}</strong> sellos en la cuponera
            activa.
          </p>
          <ul className="meta">
            {tiers.map((tier) => {
              const alcanzado = activa.sellos_actuales >= tier.sellos_requeridos
              return (
                <li key={tier.id}>
                  {tier.sellos_requeridos}+ sellos → {tier.descuento_porcentaje}%
                  {alcanzado ? ' ✓' : ''}
                  {tier.descripcion ? ` — ${tier.descripcion}` : ''}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {settings ? (
        <p className="meta">
          Meta por cuponera (configuración del salón): {settings.sellos_por_cuponera}{' '}
          sellos.
        </p>
      ) : null}
    </div>
  )
}
