import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { Message } from 'primereact/message'
import { supabase } from '../../lib/supabaseClient'
import { adminInputNumberCurrencyProps, formatMoneyGtq } from '../../lib/adminFormatMoney.js'
import { fetchCuentasBancariasOptions } from '../../lib/movimientosBancarios.js'
import { ejecutarTrasladoEntreCuentas } from '../../lib/trasladoBancario.js'

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TrasladoEntreCuentasSection({ onMessage }) {
  const [cuentasOpts, setCuentasOpts] = useState([])
  const [origenId, setOrigenId] = useState(null)
  const [destinoId, setDestinoId] = useState(null)
  const [monto, setMonto] = useState(null)
  const [fecha, setFecha] = useState(new Date())
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)

  const loadCuentas = useCallback(async () => {
    try {
      setCuentasOpts(await fetchCuentasBancariasOptions(supabase))
    } catch {
      setCuentasOpts([])
    }
  }, [])

  const loadHistorial = useCallback(async () => {
    setLoadingHist(true)
    const { data, error } = await supabase
      .from('movimientos_cuenta_bancaria')
      .select('traslado_grupo_id, tipo, monto, fecha, descripcion, created_at, cuenta_bancaria_id')
      .not('traslado_grupo_id', 'is', null)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setLoadingHist(false)
    if (error) {
      if (error.message?.includes('traslado_grupo_id') || error.message?.includes('column')) {
        setHistorial([])
        return
      }
      onMessage?.({ ok: false, text: `No se pudo cargar el historial: ${error.message}` })
      setHistorial([])
      return
    }
    const byGrupo = new Map()
    for (const row of data || []) {
      const g = row.traslado_grupo_id
      if (!g) continue
      if (!byGrupo.has(g)) {
        byGrupo.set(g, { grupo: g, retiro: null, deposito: null, monto: row.monto, fecha: row.fecha, creado: row.created_at })
      }
      const b = byGrupo.get(g)
      if (row.tipo === 'retiro') b.retiro = row
      if (row.tipo === 'deposito') b.deposito = row
      if (row.created_at && (!b.creado || row.created_at > b.creado)) b.creado = row.created_at
    }
    const list = [...byGrupo.values()]
      .map((b) => {
        const r = b.retiro?.descripcion || ''
        const d = b.deposito?.descripcion || ''
        return {
          grupo: b.grupo,
          fecha: b.fecha,
          monto: b.monto,
          creado: b.creado,
          resumen: r && d ? `${r} · ${d}` : r || d || b.grupo,
        }
      })
      .sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))
    setHistorial(list)
  }, [onMessage])

  useEffect(() => {
    queueMicrotask(() => {
      void loadCuentas()
      void loadHistorial()
    })
  }, [loadCuentas, loadHistorial])

  const destinoOptions = useMemo(
    () => cuentasOpts.filter((o) => o.value !== origenId),
    [cuentasOpts, origenId]
  )

  const origenOptions = useMemo(
    () => cuentasOpts.filter((o) => o.value !== destinoId),
    [cuentasOpts, destinoId]
  )

  async function guardar() {
    setErr(null)
    if (!origenId || !destinoId) {
      setErr('Elige cuenta de origen y de destino.')
      return
    }
    if (origenId === destinoId) {
      setErr('Origen y destino deben ser distintas.')
      return
    }
    if (monto == null || Number(monto) <= 0) {
      setErr('Indica un monto mayor a 0.')
      return
    }
    const iso = toIsoDate(fecha)
    if (!iso) {
      setErr('Fecha inválida.')
      return
    }
    setSaving(true)
    const { error } = await ejecutarTrasladoEntreCuentas(supabase, {
      cuentaOrigenId: origenId,
      cuentaDestinoId: destinoId,
      monto: Number(monto),
      fechaIso: iso,
      nota: nota.trim() || undefined,
    })
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onMessage?.({ ok: true, text: 'Traslado registrado (un retiro y un depósito vinculados).' })
    setMonto(null)
    setNota('')
    setDestinoId(null)
    loadHistorial()
  }

  return (
    <div className="admin-panel">
      <h2>Traslado entre cuentas</h2>
      <p className="lead">
        Mueve saldo de una cuenta a otra en un solo paso. Se crean automáticamente un retiro en el origen y un
        depósito en el destino (mismo monto, misma moneda). Las cuentas deben compartir moneda.
      </p>

      {err ? <Message severity="error" text={err} className="admin-pr-message w-full mb-3" onClose={() => setErr(null)} closable /> : null}

      <div className="admin-compra-step-grid" style={{ maxWidth: '36rem' }}>
        <div>
          <label htmlFor="tr-origen">Cuenta origen (sale el dinero) *</label>
          <Dropdown
            id="tr-origen"
            value={origenId}
            options={origenOptions}
            onChange={(e) => {
              setOrigenId(e.value)
              if (e.value === destinoId) setDestinoId(null)
            }}
            optionLabel="label"
            optionValue="value"
            filter
            placeholder="Selecciona cuenta"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="tr-dest">Cuenta destino (entra el dinero) *</label>
          <Dropdown
            id="tr-dest"
            value={destinoId}
            options={destinoOptions}
            onChange={(e) => {
              setDestinoId(e.value)
              if (e.value === origenId) setOrigenId(null)
            }}
            optionLabel="label"
            optionValue="value"
            filter
            placeholder="Selecciona cuenta"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="tr-monto">Monto (Q) *</label>
          <InputNumber
            id="tr-monto"
            value={monto}
            onValueChange={(e) => setMonto(e.value ?? null)}
            {...adminInputNumberCurrencyProps}
            min={0.01}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="tr-fecha">Fecha *</label>
          <Calendar
            id="tr-fecha"
            value={fecha}
            onChange={(e) => setFecha(e.value ?? new Date())}
            dateFormat="dd/mm/yy"
            showIcon
            className="w-full"
          />
        </div>
        <div className="admin-compra-field-full">
          <label htmlFor="tr-nota">Nota (opcional)</label>
          <InputText
            id="tr-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="w-full"
            placeholder="Referencia interna, etc."
          />
        </div>
        <div>
          <Button
            type="button"
            label="Registrar traslado"
            icon="pi pi-arrows-h"
            loading={saving}
            onClick={guardar}
            disabled={cuentasOpts.length < 2}
          />
        </div>
      </div>

      <h3 className="admin-report-subtitle" style={{ marginTop: '1.75rem' }}>
        Traslados recientes
      </h3>
      <p className="lead" style={{ fontSize: '0.95rem' }}>
        Pares vinculados con el mismo grupo de traslado. Si no ves filas, ejecuta en Supabase{' '}
        <code style={{ fontSize: '0.85rem' }}>010_traslado_grupo_movimientos.sql</code> para añadir la columna.
      </p>
      <div className="admin-catalog-card" style={{ marginTop: '0.5rem' }}>
        <DataTable
          value={historial}
          dataKey="grupo"
          loading={loadingHist}
          paginator
          rows={8}
          size="small"
          emptyMessage="Aún no hay traslados registrados con esta vinculación."
        >
          <Column
            field="fecha"
            header="Fecha"
            body={(r) => (r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-GT') : '—')}
            style={{ width: '9rem' }}
          />
          <Column field="monto" header="Monto" body={(r) => formatMoneyGtq(r.monto)} style={{ width: '9rem' }} />
          <Column field="resumen" header="Descripción" />
        </DataTable>
      </div>
    </div>
  )
}
