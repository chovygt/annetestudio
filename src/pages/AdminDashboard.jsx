import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from 'primereact/button'
import { Card } from 'primereact/card'
import { Chart } from 'primereact/chart'
import { Divider } from 'primereact/divider'
import { Message } from 'primereact/message'
import { Sidebar } from 'primereact/sidebar'
import AdminConfirmarCorreosSection from '../components/admin/AdminConfirmarCorreosSection.jsx'
import CatalogoBancosCuentasSection from '../components/admin/CatalogoBancosCuentasSection.jsx'
import CatalogoClientasManualesSection from '../components/admin/CatalogoClientasManualesSection.jsx'
import CatalogoProveedoresSection from '../components/admin/CatalogoProveedoresSection.jsx'
import CatalogoServiciosSection from '../components/admin/CatalogoServiciosSection.jsx'
import MovimientosBancariosManualSection from '../components/admin/MovimientosBancariosManualSection.jsx'
import ReporteBancosSection from '../components/admin/ReporteBancosSection.jsx'
import TrasladoEntreCuentasSection from '../components/admin/TrasladoEntreCuentasSection.jsx'
import ComprasCuentaPorPagarReport from '../components/admin/ComprasCuentaPorPagarReport.jsx'
import ComprasSection from '../components/admin/ComprasSection.jsx'
import CobrosClientesSection from '../components/admin/CobrosClientesSection.jsx'
import PagosProveedoresSection from '../components/admin/PagosProveedoresSection.jsx'
import VentasReporteSection from '../components/admin/VentasReporteSection.jsx'
import VentasSection from '../components/admin/VentasSection.jsx'
import CerrarCuponeraDialog from '../components/admin/CerrarCuponeraDialog.jsx'
import TokenQrDialog from '../components/admin/TokenQrDialog.jsx'
import ViewTokenQrDialog from '../components/admin/ViewTokenQrDialog.jsx'
import { useAuth } from '../contexts/AuthContext'
import { adminBarChartOptions, barDatasetFromBuckets } from '../lib/adminChartTheme.js'
import { countIntoBuckets, last12MonthBuckets } from '../lib/adminMonthlyBuckets.js'
import QRCodeLib from 'qrcode'
import { QR_TOKEN_DISPLAY_OPTIONS } from '../lib/qrTokenDisplayOptions.js'
import { supabase } from '../lib/supabaseClient'
import './AppShell.css'
import './AdminDashboard.css'

const SECTIONS = [
  { id: 'inicio', label: 'Inicio' },
  {
    id: 'catalogos',
    label: 'Catálogos',
    children: [
      { id: 'catalogo_proveedores', label: 'Proveedores' },
      { id: 'catalogo_clientas', label: 'Clientas manuales' },
      { id: 'catalogo_servicios', label: 'Servicios' },
      { id: 'catalogo_bancos', label: 'Bancos y cuentas' },
    ],
  },
  {
    id: 'usuarios_group',
    label: 'Usuarios',
    children: [{ id: 'usuarios_correo', label: 'Confirmar correos' }],
  },
  {
    id: 'cupones',
    label: 'Cupones',
    children: [
      { id: 'sellos', label: 'Sellos por cuponera' },
      { id: 'descuentos', label: 'Porcentajes de descuentos' },
      { id: 'token', label: 'Generar token' },
      { id: 'status', label: 'Status cuponeras' },
      { id: 'historial', label: 'Historial' },
      { id: 'cerrar', label: 'Canjear cuponera' },
    ],
  },
  {
    id: 'compras_group',
    label: 'Compras',
    children: [
      { id: 'compras', label: 'Registro' },
      { id: 'compras_pagos', label: 'Pagos a proveedores' },
      { id: 'compras_cxp', label: 'Cuenta por pagar' },
    ],
  },
  {
    id: 'ventas_group',
    label: 'Ventas',
    children: [
      { id: 'ventas', label: 'Registro' },
      { id: 'ventas_cobros', label: 'Cobros de clientas' },
      { id: 'ventas_reporte', label: 'Reporte' },
    ],
  },
  {
    id: 'bancos_group',
    label: 'Bancos',
    children: [
      { id: 'bancos_traslado', label: 'Traslado entre cuentas' },
      { id: 'bancos_reporte', label: 'Reporte de bancos' },
      { id: 'bancos_ingresos', label: 'Ingresos manuales' },
      { id: 'bancos_retiros', label: 'Retiros manuales' },
    ],
  },
]

const ALL_ADMIN_SECTION_IDS = new Set(
  SECTIONS.flatMap((s) => (s.children ? s.children.map((c) => c.id) : [s.id]))
)

const ADMIN_SECTION_STORAGE_KEY = 'tv_admin_section'

async function fetchSettings() {
  const { data } = await supabase.from('program_settings').select('*').limit(1).maybeSingle()
  return data
}

async function fetchTiers() {
  const { data, error } = await supabase
    .from('reward_tiers')
    .select('*')
    .order('orden', { ascending: true })
    .order('sellos_requeridos', { ascending: true })
  if (error) throw error
  return data || []
}

async function fetchClientasActivas() {
  const { data: profiles, error: e1 } = await supabase
    .from('profiles')
    .select('id,nombre,email')
    .eq('role', 'clienta')
    .order('nombre', { ascending: true })
  if (e1) throw e1
  const { data: cuponeras, error: e2 } = await supabase
    .from('cuponeras')
    .select('id,clienta_id,numero_secuencia,meta_sellos,sellos_actuales,estado')
    .eq('estado', 'activa')
  if (e2) throw e2
  const map = new Map((cuponeras || []).map((c) => [c.clienta_id, c]))
  return (profiles || []).map((p) => ({ ...p, cuponeraActiva: map.get(p.id) || null }))
}

async function fetchHistorial() {
  const q = supabase
    .from('sello_events')
    .select(
      `
      id,
      created_at,
      tipo,
      sellos,
      notas,
      clienta_id,
      cuponera_id,
      qr_token_id,
      profiles ( nombre, email ),
      cuponeras ( numero_secuencia, estado, sellos_actuales, meta_sellos ),
      qr_tokens ( token, cantidad_sellos )
    `
    )
    .order('created_at', { ascending: false })
    .limit(400)
  const { data, error } = await q
  if (error) {
    const { data: flat, error: e2 } = await supabase
      .from('sello_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(400)
    if (e2) throw e2
    return (flat || []).map((row) => ({
      ...row,
      profiles: null,
      cuponeras: null,
      qr_tokens: null,
    }))
  }
  return data || []
}

async function fetchRecentTokens() {
  const { data } = await supabase
    .from('qr_tokens')
    .select('id,token,cantidad_sellos,created_at,canjes_realizados,max_canjes')
    .order('created_at', { ascending: false })
    .limit(12)
  return data || []
}

async function fetchDashboardMetrics() {
  const from = new Date()
  from.setMonth(from.getMonth() - 11)
  from.setDate(1)
  from.setHours(0, 0, 0, 0)
  const fromIso = from.toISOString()

  const [r1, r2, r3, r4] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'clienta'),
    supabase.from('cuponeras').select('id', { count: 'exact', head: true }).eq('estado', 'activa'),
    supabase.from('qr_tokens').select('created_at').gte('created_at', fromIso),
    supabase
      .from('cuponeras')
      .select('completada_en')
      .eq('estado', 'completada')
      .not('completada_en', 'is', null)
      .gte('completada_en', fromIso),
  ])

  const tokensPorMes = last12MonthBuckets()
  const cerradasPorMes = last12MonthBuckets()
  if (!r3.error && r3.data) countIntoBuckets(tokensPorMes, r3.data, 'created_at')
  if (!r4.error && r4.data) countIntoBuckets(cerradasPorMes, r4.data, 'completada_en')

  return {
    numClientas: r1.count ?? 0,
    numCuponerasAbiertas: r2.count ?? 0,
    tokensPorMes,
    cerradasPorMes,
  }
}

export default function AdminDashboard() {
  const { profile, user, signOut } = useAuth()
  const [section, setSection] = useState(() => {
    try {
      const raw = sessionStorage.getItem(ADMIN_SECTION_STORAGE_KEY)
      if (raw && ALL_ADMIN_SECTION_IDS.has(raw)) return raw
    } catch {
      /* modo privado / quota */
    }
    return 'inicio'
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuGroupsOpen, setMenuGroupsOpen] = useState({
    catalogos: false,
    usuarios_group: false,
    cupones: false,
    compras_group: false,
    ventas_group: false,
    bancos_group: false,
  })
  const [msg, setMsg] = useState(null)

  const [dashLoading, setDashLoading] = useState(true)
  const [dash, setDash] = useState({
    numClientas: 0,
    numCuponerasAbiertas: 0,
    tokensPorMes: last12MonthBuckets(),
    cerradasPorMes: last12MonthBuckets(),
  })

  const [settings, setSettings] = useState(null)
  const [sellosPorCuponera, setSellosPorCuponera] = useState('10')

  const [tiers, setTiers] = useState([])
  const [tierSellos, setTierSellos] = useState('3')
  const [tierPct, setTierPct] = useState('10')
  const [tierDesc, setTierDesc] = useState('')

  const [statusRows, setStatusRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('')

  const [historial, setHistorial] = useState([])
  const [historialLoading, setHistorialLoading] = useState(false)

  const [recentTokens, setRecentTokens] = useState([])

  const [tokenDlg, setTokenDlg] = useState(false)
  const [viewQr, setViewQr] = useState(null)
  const [viewQrRowId, setViewQrRowId] = useState(null)
  const [cerrarDlg, setCerrarDlg] = useState(false)
  const [cerrarPreset, setCerrarPreset] = useState(null)

  const refreshSettings = useCallback(() => {
    fetchSettings().then((s) => {
      if (s) {
        setSettings(s)
        setSellosPorCuponera(String(s.sellos_por_cuponera))
      }
    })
  }, [])

  const refreshTiers = useCallback(() => {
    fetchTiers().then(setTiers).catch((e) => console.error(e))
  }, [])

  const refreshStatus = useCallback(() => {
    fetchClientasActivas().then(setStatusRows).catch((e) => console.error(e))
  }, [])

  const refreshHistorial = useCallback(() => {
    setHistorialLoading(true)
    fetchHistorial()
      .then(setHistorial)
      .catch((e) => {
        console.error(e)
        setMsg({
          ok: false,
          text: 'No se pudo cargar el historial. Revisa permisos RLS o la consola.',
        })
      })
      .finally(() => setHistorialLoading(false))
  }, [])

  const refreshRecentTokens = useCallback(() => {
    fetchRecentTokens().then(setRecentTokens)
  }, [])

  const refreshDashboard = useCallback(() => {
    setDashLoading(true)
    fetchDashboardMetrics()
      .then(setDash)
      .catch((e) => {
        console.error(e)
        setMsg({ ok: false, text: 'No se pudo cargar el resumen del panel.' })
      })
      .finally(() => setDashLoading(false))
  }, [])

  useEffect(() => {
    refreshSettings()
    refreshTiers()
    refreshRecentTokens()
  }, [refreshSettings, refreshTiers, refreshRecentTokens])

  useEffect(() => {
    if (section === 'inicio') {
      queueMicrotask(() => refreshDashboard())
    }
    if (section === 'status' || section === 'cerrar') {
      queueMicrotask(() => refreshStatus())
    }
    if (section === 'historial') {
      queueMicrotask(() => refreshHistorial())
    }
  }, [section, refreshDashboard, refreshStatus, refreshHistorial])

  const clientasOptions = useMemo(
    () => statusRows.map(({ id, nombre, email }) => ({ id, nombre, email })),
    [statusRows]
  )

  const statusFiltered = useMemo(() => {
    const q = statusFilter.trim().toLowerCase()
    if (!q) return statusRows
    return statusRows.filter((r) => {
      const n = (r.nombre || '').toLowerCase()
      const e = (r.email || '').toLowerCase()
      return n.includes(q) || e.includes(q)
    })
  }, [statusRows, statusFilter])

  const chartTokensData = useMemo(
    () =>
      barDatasetFromBuckets(
        dash.tokensPorMes,
        'Tokens generados',
        'rgba(181, 101, 76, 0.78)',
        '#8c4a38'
      ),
    [dash.tokensPorMes]
  )

  const chartCerradasData = useMemo(
    () =>
      barDatasetFromBuckets(
        dash.cerradasPorMes,
        'Cuponeras cerradas',
        'rgba(122, 143, 126, 0.75)',
        '#556b5f'
      ),
    [dash.cerradasPorMes]
  )

  const chartOptions = useMemo(() => adminBarChartOptions, [])

  async function openViewTokenQr(r) {
    setViewQrRowId(r.id)
    let dataUrl = ''
    let qrErr = ''
    try {
      dataUrl = await QRCodeLib.toDataURL(r.token, QR_TOKEN_DISPLAY_OPTIONS)
    } catch (e) {
      qrErr = e?.message || 'No se pudo generar el QR'
    } finally {
      setViewQrRowId(null)
    }
    setViewQr({
      token: r.token,
      dataUrl,
      qrErr,
      cantidadSellos: r.cantidad_sellos,
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
    setMsg({ ok: true, text: 'Sellos por cuponera guardados.' })
    refreshSettings()
  }

  async function addTier(e) {
    e.preventDefault()
    setMsg(null)
    const s = parseInt(tierSellos, 10)
    const p = parseFloat(tierPct)
    if (Number.isNaN(s) || s < 1) {
      setMsg({ ok: false, text: 'Sellos requeridos inválidos.' })
      return
    }
    if (Number.isNaN(p) || p < 0 || p > 100) {
      setMsg({ ok: false, text: 'Porcentaje inválido (0–100).' })
      return
    }
    const orden = (tiers[tiers.length - 1]?.orden ?? 0) + 1
    const { error } = await supabase.from('reward_tiers').insert({
      sellos_requeridos: s,
      descuento_porcentaje: p,
      descripcion: tierDesc.trim() || null,
      orden,
      activo: true,
    })
    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }
    setTierSellos('3')
    setTierPct('10')
    setTierDesc('')
    setMsg({ ok: true, text: 'Tramo añadido.' })
    refreshTiers()
  }

  async function deleteTier(id) {
    setMsg(null)
    const { error } = await supabase.from('reward_tiers').delete().eq('id', id)
    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }
    setMsg({ ok: true, text: 'Tramo eliminado.' })
    refreshTiers()
  }

  function openCerrar(clientaId) {
    setCerrarPreset(clientaId || null)
    setCerrarDlg(true)
  }

  function tipoLabel(t) {
    const m = {
      canje_qr: 'Canje QR',
      ajuste_admin: 'Ajuste admin',
      completar_cuponera: 'Cuponera completada',
    }
    return m[t] || t
  }

  const sectionTitle =
    SECTIONS.flatMap((s) => (s.children ? s.children : [s])).find((s) => s.id === section)?.label ??
    'Admin'

  function goSection(id) {
    setSection(id)
    setMenuOpen(false)
    setMsg(null)
    try {
      sessionStorage.setItem(ADMIN_SECTION_STORAGE_KEY, id)
    } catch {
      /* ignorar */
    }
  }

  function isChildSectionOfGroup(groupId, childId) {
    const group = SECTIONS.find((s) => s.id === groupId)
    return Boolean(group?.children?.some((child) => child.id === childId))
  }

  useEffect(() => {
    const nextOpenState = {}
    for (const s of SECTIONS) {
      if (!s.children) continue
      if (isChildSectionOfGroup(s.id, section)) nextOpenState[s.id] = true
    }
    if (Object.keys(nextOpenState).length > 0) {
      setMenuGroupsOpen((prev) => ({ ...prev, ...nextOpenState }))
    }
  }, [section])

  return (
    <div className="admin-shell">
      <header className="admin-appbar">
        <Button
          type="button"
          icon="pi pi-bars"
          rounded
          outlined
          aria-expanded={menuOpen}
          aria-controls="admin-drawer"
          aria-label="Abrir menú"
          onClick={() => setMenuOpen(true)}
        />
        <h1 className="admin-page-title">{sectionTitle}</h1>
        <div className="admin-appbar-actions">
          <Link to="/mi-tarjeta">Vista clienta</Link>
          <Button type="button" label="Salir" outlined severity="secondary" onClick={() => signOut()} />
        </div>
      </header>

      <Sidebar
        visible={menuOpen}
        position="left"
        onHide={() => setMenuOpen(false)}
        className="admin-pr-sidebar"
        style={{ width: 'min(20rem, 90vw)' }}
        id="admin-drawer"
        header={
          <div className="admin-sidebar-header-inner">
            <img
              className="admin-drawer-logo"
              src="/images/logo-anneth.png"
              width={130}
              height={68}
              alt="Anneth Beauty Studio"
            />
            <Button
              type="button"
              icon="pi pi-times"
              rounded
              text
              severity="secondary"
              aria-label="Cerrar menú"
              onClick={() => setMenuOpen(false)}
            />
          </div>
        }
      >
        <p className="admin-drawer-email">{profile?.email}</p>
        <Divider className="admin-divider-tight" />
        <nav className="admin-drawer-nav" aria-label="Secciones">
          {SECTIONS.map((s) =>
            s.children ? (
              <div key={s.id} className="admin-drawer-group">
                <Button
                  type="button"
                  label={s.label}
                  icon={menuGroupsOpen[s.id] ? 'pi pi-chevron-up' : 'pi pi-chevron-down'}
                  iconPos="right"
                  onClick={() =>
                    setMenuGroupsOpen((prev) => ({
                      ...prev,
                      [s.id]: !prev[s.id],
                    }))
                  }
                  className="admin-drawer-nav-btn admin-drawer-nav-group-btn"
                  outlined
                  severity="secondary"
                />
                {menuGroupsOpen[s.id] ? (
                  <div className="admin-drawer-subnav">
                    {s.children.map((child) => (
                      <Button
                        key={child.id}
                        type="button"
                        label={child.label}
                        onClick={() => goSection(child.id)}
                        className="admin-drawer-nav-btn admin-drawer-subnav-btn"
                        outlined={section !== child.id}
                        severity={section === child.id ? undefined : 'secondary'}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <Button
                key={s.id}
                type="button"
                label={s.label}
                onClick={() => goSection(s.id)}
                className="admin-drawer-nav-btn"
                outlined={section !== s.id}
                severity={section === s.id ? undefined : 'secondary'}
              />
            )
          )}
        </nav>
      </Sidebar>

      {msg ? (
        <Message
          severity={msg.ok ? 'success' : 'error'}
          text={msg.text}
          className="admin-pr-message w-full mb-3"
          onClose={() => setMsg(null)}
          closable
        />
      ) : null}

      {section === 'inicio' ? (
        <div className="admin-panel admin-dashboard-home">
          <h2>Panel general</h2>
          <p className="lead">
            Vista rápida de clientas, cuponeras activas y tendencia mensual de códigos generados y
            tarjetas cerradas.
          </p>
          {dashLoading ? (
            <p className="lead">Cargando datos…</p>
          ) : (
            <>
              <div className="admin-kpi-grid">
                <Card
                  className="admin-p-card"
                  title="Número de clientas"
                  subTitle="Usuarios con rol clienta"
                >
                  <span className="admin-kpi-num-prime">{dash.numClientas}</span>
                </Card>
                <Card
                  className="admin-p-card"
                  title="Cuponeras abiertas"
                  subTitle="Tarjetas activas en curso"
                >
                  <span className="admin-kpi-num-prime">{dash.numCuponerasAbiertas}</span>
                </Card>
              </div>
              <div className="admin-charts-grid">
                <Card className="admin-p-card" title="Cupones (tokens) generados por mes">
                  <div className="admin-chart-host">
                    <Chart type="bar" data={chartTokensData} options={chartOptions} />
                  </div>
                </Card>
                <Card className="admin-p-card" title="Cuponeras cerradas por mes">
                  <div className="admin-chart-host">
                    <Chart type="bar" data={chartCerradasData} options={chartOptions} />
                  </div>
                </Card>
              </div>
              <Button
                type="button"
                label="Actualizar resumen"
                outlined
                severity="secondary"
                onClick={refreshDashboard}
              />
            </>
          )}
        </div>
      ) : null}

      {section === 'sellos' ? (
        <div className="admin-panel">
          <h2>Sellos por cuponera</h2>
          <p className="lead">
            Meta de sellos para completar una cuponera y abrir la siguiente.
          </p>
          <form onSubmit={saveSettings} className="admin-row-actions">
            <input
              className="admin-input"
              type="number"
              min={1}
              value={sellosPorCuponera}
              onChange={(e) => setSellosPorCuponera(e.target.value)}
            />
            <button type="submit" className="admin-btn primary">
              Guardar
            </button>
          </form>
        </div>
      ) : null}

      {section === 'descuentos' ? (
        <div className="admin-panel">
          <h2>Porcentajes de descuentos</h2>
          <p className="lead">
            Ejemplo: con <strong>3</strong> sellos → <strong>10%</strong>; con <strong>5</strong> →{' '}
            <strong>20%</strong>; con <strong>10</strong> → <strong>50%</strong>. La clienta ve en su
            tarjeta el tramo alcanzado según los sellos de la cuponera activa.
          </p>
          <form onSubmit={addTier}>
            <div className="tier-row">
              <div>
                <label htmlFor="tier-sellos">Sellos mínimos</label>
                <input
                  id="tier-sellos"
                  className="admin-input full"
                  type="number"
                  min={1}
                  value={tierSellos}
                  onChange={(e) => setTierSellos(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="tier-pct">% descuento</label>
                <input
                  id="tier-pct"
                  className="admin-input full"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={tierPct}
                  onChange={(e) => setTierPct(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="tier-desc">Descripción (opcional)</label>
                <input
                  id="tier-desc"
                  className="admin-input full"
                  type="text"
                  value={tierDesc}
                  onChange={(e) => setTierDesc(e.target.value)}
                  placeholder="Ej. 10% al acumular 3 sellos"
                />
              </div>
              <div>
                <button type="submit" className="admin-btn primary">
                  Añadir tramo
                </button>
              </div>
            </div>
          </form>
          <h2 style={{ marginTop: '1.25rem', fontSize: '1.15rem' }}>Tramos actuales</h2>
          {tiers.length === 0 ? (
            <p className="lead">No hay tramos. Añade el primero arriba.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {tiers.map((t) => (
                <li
                  key={t.id}
                  className="admin-client-card"
                  style={{ marginBottom: '0.5rem' }}
                >
                  <strong>
                    {t.sellos_requeridos}+ sellos → {t.descuento_porcentaje}%
                  </strong>
                  <div className="meta">{t.descripcion || '—'}</div>
                  <div className="meta">
                    Orden {t.orden} · {t.activo ? 'Activo' : 'Inactivo'}
                  </div>
                  <button
                    type="button"
                    className="admin-btn ghost small"
                    onClick={() => deleteTier(t.id)}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {section === 'catalogo_proveedores' ? <CatalogoProveedoresSection onMessage={setMsg} /> : null}
      {section === 'usuarios_correo' ? <AdminConfirmarCorreosSection onMessage={setMsg} /> : null}
      {section === 'catalogo_clientas' ? <CatalogoClientasManualesSection onMessage={setMsg} /> : null}
      {section === 'catalogo_servicios' ? <CatalogoServiciosSection onMessage={setMsg} /> : null}
      {section === 'catalogo_bancos' ? <CatalogoBancosCuentasSection onMessage={setMsg} /> : null}
      {section === 'bancos_traslado' ? <TrasladoEntreCuentasSection onMessage={setMsg} /> : null}
      {section === 'bancos_reporte' ? <ReporteBancosSection /> : null}
      {section === 'bancos_ingresos' ? <MovimientosBancariosManualSection tipo="deposito" onMessage={setMsg} /> : null}
      {section === 'bancos_retiros' ? <MovimientosBancariosManualSection tipo="retiro" onMessage={setMsg} /> : null}
      {section === 'compras' ? <ComprasSection onMessage={setMsg} /> : null}
      {section === 'compras_pagos' ? <PagosProveedoresSection onMessage={setMsg} /> : null}
      {section === 'compras_cxp' ? <ComprasCuentaPorPagarReport /> : null}
      {section === 'ventas' ? <VentasSection onMessage={setMsg} /> : null}
      {section === 'ventas_cobros' ? <CobrosClientesSection onMessage={setMsg} /> : null}
      {section === 'ventas_reporte' ? <VentasReporteSection /> : null}

      {section === 'token' ? (
        <div className="admin-panel">
          <h2>Generar token</h2>
          <p className="lead">
            Abre el diálogo, indica cuántos sellos otorga el código y obtén el QR listo para mostrar
            en el salón.
          </p>
          <button type="button" className="admin-btn primary" onClick={() => setTokenDlg(true)}>
            Abrir generador con QR
          </button>
          <h2 style={{ marginTop: '1.5rem', fontSize: '1.15rem' }}>Últimos códigos</h2>
          {recentTokens.length === 0 ? (
            <p className="lead">Ninguno aún.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Creado</th>
                    <th>Sellos</th>
                    <th>Usos</th>
                    <th>Token</th>
                    <th>QR</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTokens.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString('es')}</td>
                      <td>{r.cantidad_sellos}</td>
                      <td>
                        {r.canjes_realizados}/{r.max_canjes}
                      </td>
                      <td>
                        <code>{r.token}</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn ghost small"
                          disabled={viewQrRowId === r.id}
                          onClick={() => openViewTokenQr(r)}
                        >
                          {viewQrRowId === r.id ? 'Abriendo…' : 'Ver QR'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {section === 'status' ? (
        <div className="admin-panel">
          <h2>Status cuponeras</h2>
          <p className="lead">
            Sellos acumulados en la <strong>última cuponera activa</strong> por clienta. Si aún no
            tiene cuponera, aparece como sin tarjeta activa.
          </p>
          <div className="admin-toolbar">
            <input
              type="search"
              placeholder="Filtrar por nombre o correo…"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
            <button type="button" className="admin-btn ghost" onClick={refreshStatus}>
              Actualizar
            </button>
          </div>
          <div className="admin-cards-grid">
            {statusFiltered.map((r) => (
              <div key={r.id} className="admin-client-card">
                <strong>{r.nombre || r.email || 'Sin nombre'}</strong>
                <div className="meta">{r.email}</div>
                {r.cuponeraActiva ? (
                  <>
                    <div className="stats">
                      Cuponera #{r.cuponeraActiva.numero_secuencia}:{' '}
                      <strong>
                        {r.cuponeraActiva.sellos_actuales} / {r.cuponeraActiva.meta_sellos}
                      </strong>{' '}
                      sellos
                    </div>
                    <div className="meta">Estado: activa</div>
                  </>
                ) : (
                  <div className="stats">Sin cuponera activa (aún no canjea sellos).</div>
                )}
                <button
                  type="button"
                  className="admin-btn ghost small"
                  onClick={() => openCerrar(r.id)}
                >
                  Canjear cuponera…
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {section === 'historial' ? (
        <div className="admin-panel">
          <h2>Historial</h2>
          <p className="lead">
            Movimientos: canjes por token, cuponeras completadas y notas. Desplázate horizontalmente
            en móvil.
          </p>
          <div className="admin-toolbar">
            <button type="button" className="admin-btn ghost" onClick={refreshHistorial}>
              Actualizar
            </button>
          </div>
          {historialLoading ? (
            <p className="lead">Cargando…</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Clienta</th>
                    <th>Sellos</th>
                    <th>Cuponera</th>
                    <th>Token / nota</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((row) => {
                    const perf = row.profiles
                    const cup = row.cuponeras
                    const tok = row.qr_tokens
                    return (
                      <tr key={row.id}>
                        <td>{new Date(row.created_at).toLocaleString('es')}</td>
                        <td>{tipoLabel(row.tipo)}</td>
                        <td>
                          {perf?.nombre || perf?.email || row.clienta_id || '—'}
                          <br />
                          <span className="meta">{perf?.email || ''}</span>
                        </td>
                        <td>{row.sellos}</td>
                        <td>
                          {cup
                            ? `#${cup.numero_secuencia} (${cup.estado}) ${cup.sellos_actuales ?? ''}/${cup.meta_sellos ?? ''}`
                            : '—'}
                        </td>
                        <td>
                          {tok?.token ? <code>{tok.token}</code> : null}
                          {row.notas ? (
                            <div className="meta" style={{ marginTop: '0.25rem' }}>
                              {row.notas}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {section === 'cerrar' ? (
        <div className="admin-panel">
          <h2>Canjear cuponera</h2>
          <p className="lead">
            Uso típico: la clienta canjeó su recompensa en salón o quieres reiniciar la tarjeta.
            Cierra la cuponera activa (aunque no esté llena) y se crea una nueva con la meta actual.
          </p>
          <p className="lead">
            Primero ejecuta en Supabase el script{' '}
            <code style={{ fontSize: '0.85rem' }}>supabase/002_admin_cerrar_cuponera.sql</code> si aún
            no lo has corrido.
          </p>
          <button type="button" className="admin-btn primary warn" onClick={() => openCerrar(null)}>
            Elegir clienta y cerrar…
          </button>
        </div>
      ) : null}

      <TokenQrDialog
        open={tokenDlg}
        onClose={() => setTokenDlg(false)}
        userId={user?.id}
        onCreated={() => {
          refreshRecentTokens()
          refreshDashboard()
          setMsg({ ok: true, text: 'Código generado.' })
        }}
      />

      <ViewTokenQrDialog
        open={viewQr !== null}
        onClose={() => setViewQr(null)}
        token={viewQr?.token ?? ''}
        dataUrl={viewQr?.dataUrl ?? ''}
        qrErr={viewQr?.qrErr ?? ''}
        cantidadSellos={viewQr?.cantidadSellos}
      />

      <CerrarCuponeraDialog
        key={cerrarDlg ? `${cerrarPreset ?? 'none'}` : 'closed'}
        open={cerrarDlg}
        onClose={() => {
          setCerrarDlg(false)
          setCerrarPreset(null)
        }}
        clientaIdInicial={cerrarPreset}
        clientas={clientasOptions}
        onDone={() => {
          refreshStatus()
          refreshDashboard()
          if (section === 'historial') refreshHistorial()
          setMsg({ ok: true, text: 'Cuponera cerrada correctamente.' })
        }}
      />
    </div>
  )
}
