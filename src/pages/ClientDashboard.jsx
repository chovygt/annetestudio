import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [scanOpen, setScanOpen] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [scanBusy, setScanBusy] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const rafRef = useRef(0)
  const stoppingRef = useRef(false)

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

  async function redeemToken(rawToken) {
    setRedeemMsg(null)
    const t = rawToken.trim()
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

  async function handleRedeem(e) {
    e.preventDefault()
    await redeemToken(tokenInput)
  }

  function stopScanner() {
    stoppingRef.current = true
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    detectorRef.current = null
    setScanOpen(false)
    setScanBusy(false)
  }

  async function scanFrame() {
    if (stoppingRef.current || !scanOpen) return
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector) return
    if (video.readyState >= 2) {
      try {
        const detections = await detector.detect(video)
        if (detections.length > 0) {
          const rawValue = detections[0]?.rawValue?.trim()
          if (rawValue) {
            setTokenInput(rawValue)
            setScanMsg('Código detectado. Canjeando…')
            stopScanner()
            await redeemToken(rawValue)
            return
          }
        }
      } catch {
        // Evita romper la UI por errores puntuales del detector.
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame)
  }

  async function startScanner() {
    setRedeemMsg(null)
    setScanMsg('')
    if (!window.BarcodeDetector) {
      setRedeemMsg({
        ok: false,
        text: 'Tu navegador no soporta escaneo QR directo. Escribe o pega el token manualmente.',
      })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setRedeemMsg({
        ok: false,
        text: 'No se pudo acceder a la cámara en este dispositivo.',
      })
      return
    }
    setScanBusy(true)
    stoppingRef.current = false
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      detectorRef.current = detector
      streamRef.current = stream
      setScanOpen(true)
      setScanMsg('Apunta al QR para detectar el código automáticamente.')
      queueMicrotask(() => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        videoRef.current
          .play()
          .then(() => {
            rafRef.current = requestAnimationFrame(scanFrame)
          })
          .catch(() => {
            setRedeemMsg({ ok: false, text: 'No fue posible iniciar el video de la cámara.' })
            stopScanner()
          })
      })
    } catch {
      setRedeemMsg({ ok: false, text: 'No se pudo abrir la cámara. Revisa permisos del navegador.' })
      stopScanner()
    } finally {
      setScanBusy(false)
    }
  }

  useEffect(() => () => stopScanner(), [])

  const activa = cuponeras.find((c) => c.estado === 'activa')
  const metaSellos = Math.max(1, Number(activa?.meta_sellos ?? settings?.sellos_por_cuponera ?? 10))
  const sellosActuales = Math.max(0, Number(activa?.sellos_actuales ?? 0))
  const slotsCuponera = useMemo(
    () =>
      Array.from({ length: metaSellos }, (_, i) => ({
        id: i,
        lleno: i < sellosActuales,
      })),
    [metaSellos, sellosActuales]
  )

  return (
    <div className="app-shell">
      <header>
        <div className="app-header-brand">
          <img
            className="app-logo"
            src="/images/logo-anneth.png"
            width={160}
            height={80}
            alt="Anneth Beauty Studio"
          />
          <div>
            <p className="app-kicker">Tarjeta de fidelidad</p>
            <div className="meta">
              {profile?.nombre || profile?.email} · Clienta
            </div>
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
        <div className="row-actions" style={{ marginTop: '0.45rem' }}>
          <button type="button" className="ghost" disabled={scanBusy} onClick={startScanner}>
            {scanBusy ? 'Abriendo cámara…' : 'Escanear QR con cámara'}
          </button>
          {scanOpen ? (
            <button type="button" className="ghost" onClick={stopScanner}>
              Cerrar cámara
            </button>
          ) : null}
        </div>
        {scanOpen ? (
          <div className="coupon-scanner-wrap">
            <video ref={videoRef} className="coupon-scanner-video" muted playsInline autoPlay />
            <div className="coupon-scan-frame" aria-hidden="true" />
          </div>
        ) : null}
        {scanMsg ? <p className="meta">{scanMsg}</p> : null}
        {redeemMsg ? (
          <p className={`msg ${redeemMsg.ok ? 'ok' : 'err'}`}>{redeemMsg.text}</p>
        ) : null}
      </section>

      <section>
        <h2>Tu cuponera actual</h2>
        <div className="coupon-pass">
          <div className="coupon-pass-head">
            <strong>Cuponera {activa ? `#${activa.numero_secuencia}` : 'activa'}</strong>
            <span>
              {sellosActuales} / {metaSellos} sellos
            </span>
          </div>
          <div className="coupon-stamp-grid">
            {slotsCuponera.map((slot) => (
              <span key={slot.id} className={`coupon-stamp ${slot.lleno ? 'is-filled' : ''}`}>
                {slot.lleno ? '✓' : ''}
              </span>
            ))}
          </div>
          <div className="coupon-pass-foot">
            {activa ? (
              <span>Estado: {activa.estado}</span>
            ) : (
              <span>Sin cuponera activa todavía. Tu primer canje abrirá una.</span>
            )}
          </div>
        </div>
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
          <ul className="meta coupon-tier-list">
            {tiers.map((tier) => {
              const alcanzado = activa.sellos_actuales >= tier.sellos_requeridos
              return (
                <li key={tier.id} className={alcanzado ? 'is-hit' : ''}>
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
