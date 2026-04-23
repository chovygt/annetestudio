import { useCallback, useEffect, useState } from 'react'
import { Button } from 'primereact/button'
import { Card } from 'primereact/card'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Message } from 'primereact/message'
import { Tag } from 'primereact/tag'
import { supabase } from '../../lib/supabaseClient'
import { formatMoneyGtq } from '../../lib/adminFormatMoney.js'

function fmtFecha(f) {
  if (!f) return '—'
  return new Date(f + 'T12:00:00').toLocaleDateString('es-GT')
}

function tipoLabel(t) {
  return t === 'deposito' ? 'Depósito' : t === 'retiro' ? 'Retiro' : t
}

export default function ReporteBancosSection() {
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [seleccion, setSeleccion] = useState(null)
  const [movs, setMovs] = useState([])
  const [loadingMovs, setLoadingMovs] = useState(false)
  const [errMovs, setErrMovs] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: saldos, error: e1 } = await supabase
      .from('v_saldo_cuentas_bancarias')
      .select('*')
      .order('banco_nombre', { ascending: true })
      .order('cuenta_nombre', { ascending: true })

    if (e1) {
      setLoading(false)
      setError(e1.message)
      setFilas([])
      return
    }

    const { data: cuentas, error: e2 } = await supabase
      .from('cuentas_bancarias')
      .select('id, activa, numero_mascara, comentario')
    if (e2) {
      setLoading(false)
      setError(e2.message)
      setFilas([])
      return
    }
    const extra = new Map((cuentas || []).map((c) => [c.id, c]))
    setFilas(
      (saldos || []).map((s) => {
        const x = extra.get(s.cuenta_bancaria_id) || {}
        return { ...s, activa: x.activa !== false, numero_mascara: x.numero_mascara, comentario: x.comentario }
      })
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loadMovimientos = useCallback(async (cuentaBancariaId) => {
    if (!cuentaBancariaId) return
    setLoadingMovs(true)
    setErrMovs(null)
    const { data, error: em } = await supabase
      .from('movimientos_cuenta_bancaria')
      .select('id, tipo, monto, fecha, descripcion, referencia_externa, es_automatico, traslado_grupo_id, created_at')
      .eq('cuenta_bancaria_id', cuentaBancariaId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setLoadingMovs(false)
    if (em) {
      setErrMovs(em.message)
      setMovs([])
      return
    }
    setMovs(data || [])
  }, [])

  function onCardKeyDown(e, row) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (seleccion?.cuenta_bancaria_id === row.cuenta_bancaria_id) {
        setSeleccion(null)
        setMovs([])
        return
      }
      setSeleccion(row)
      loadMovimientos(row.cuenta_bancaria_id)
    }
  }

  return (
    <div className="admin-panel">
      <h2>Reporte de bancos</h2>
      <p className="lead">
        Saldo por cuenta (depósitos menos retiros). Abre el detalle de movimientos tocando o haciendo clic en la
        tarjeta.
      </p>

      {error ? (
        <Message
          severity="error"
          text={
            error.includes('v_saldo_cuentas_bancarias') || error.includes('schema cache')
              ? 'No se encontró la vista v_saldo_cuentas_bancarias. Ejecuta el script 009 de bancos en Supabase.'
              : error
          }
          className="admin-pr-message w-full mb-3"
        />
      ) : null}

      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-refresh" label="Actualizar" outlined severity="secondary" onClick={refresh} />
      </div>

      {loading ? (
        <p className="lead">Cargando…</p>
      ) : (
        <div className="admin-banco-cards-grid">
          {filas.map((row) => {
            const activa = row.activa !== false
            const isSel = seleccion?.cuenta_bancaria_id === row.cuenta_bancaria_id
            return (
              <Card
                key={row.cuenta_bancaria_id}
                className={`admin-p-card admin-banco-cuenta-card-outer ${!activa ? 'is-inactive' : ''} ${isSel ? 'is-selected' : ''}`}
              >
                <div
                  className="admin-banco-cuenta-card"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  onClick={() => {
                    if (isSel) {
                      setSeleccion(null)
                      setMovs([])
                      return
                    }
                    setSeleccion(row)
                    loadMovimientos(row.cuenta_bancaria_id)
                  }}
                  onKeyDown={(e) => onCardKeyDown(e, row)}
                >
                  <div className="admin-banco-card-inner">
                    <div className="admin-banco-card-bank">{row.banco_nombre}</div>
                    <div className="admin-banco-card-nombre">{row.cuenta_nombre}</div>
                    {row.numero_mascara ? (
                      <div className="admin-banco-card-meta">…{row.numero_mascara}</div>
                    ) : null}
                    <div className="admin-banco-card-moneda">{row.moneda}</div>
                    <div className="admin-banco-card-saldo">{formatMoneyGtq(row.saldo)}</div>
                    <Tag severity={activa ? 'success' : 'secondary'} value={activa ? 'Activa' : 'Inactiva'} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && filas.length === 0 && !error ? <p className="lead">No hay cuentas bancarias registradas.</p> : null}

      <Dialog
        header={seleccion ? `Movimientos — ${seleccion.cuenta_nombre}` : 'Movimientos'}
        visible={Boolean(seleccion)}
        style={{ width: 'min(56rem, 96vw)' }}
        onHide={() => {
          setSeleccion(null)
          setMovs([])
          setErrMovs(null)
        }}
        maximizable
      >
        {errMovs ? <Message severity="error" text={errMovs} className="admin-pr-message w-full mb-2" /> : null}
        {loadingMovs ? (
          <p className="lead">Cargando movimientos…</p>
        ) : (
          <DataTable
            value={movs}
            dataKey="id"
            size="small"
            paginator
            rows={15}
            scrollable
            scrollHeight="min(50vh, 24rem)"
            emptyMessage="Sin movimientos en esta cuenta."
          >
            <Column field="fecha" header="Fecha" body={(r) => fmtFecha(r.fecha)} style={{ width: '8.5rem' }} />
            <Column
              header="Tipo"
              style={{ width: '7.5rem' }}
              body={(r) => (
                <span>
                  {tipoLabel(r.tipo)}
                  {r.traslado_grupo_id ? (
                    <Tag severity="info" value="Traslado" className="ml-1" style={{ fontSize: '0.7rem' }} />
                  ) : null}
                </span>
              )}
            />
            <Column header="Monto" body={(r) => formatMoneyGtq(r.monto)} style={{ width: '9rem' }} />
            <Column
              header="Origen"
              style={{ width: '7rem' }}
              body={(r) => <Tag severity={r.es_automatico ? 'warning' : 'secondary'} value={r.es_automatico ? 'Auto' : 'Manual'} />}
            />
            <Column field="descripcion" header="Descripción" body={(r) => r.descripcion || '—'} />
            <Column field="referencia_externa" header="Ref." style={{ width: '7rem' }} body={(r) => r.referencia_externa || '—'} />
          </DataTable>
        )}
      </Dialog>
    </div>
  )
}
