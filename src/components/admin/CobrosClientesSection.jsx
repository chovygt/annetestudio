import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputTextarea } from 'primereact/inputtextarea'
import { InputText } from 'primereact/inputtext'
import { Message } from 'primereact/message'
import { Steps } from 'primereact/steps'
import { supabase } from '../../lib/supabaseClient'
import { uploadComprobanteToFacturasBucket } from '../../lib/uploadComprobanteFacturas'
import {
  ADMIN_MODAL_HISTORY_MARK,
  peelAdminModalHistory,
  pushAdminModalHistory,
  useAdminModalPopstate,
} from '../../lib/adminWizardHistory.js'

const WIZARD_STEPS = [{ label: 'Cobro' }, { label: 'Aplicar a ventas' }]

const FORMA_PAGO_OPTIONS = [
  { label: 'Efectivo', value: 'efectivo' },
  { label: 'Transferencia', value: 'transferencia' },
  { label: 'Tarjeta', value: 'tarjeta' },
]

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es')
}

function formatMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function formaPagoLabel(v) {
  return FORMA_PAGO_OPTIONS.find((o) => o.value === v)?.label || v
}

function emptyLine() {
  return { rowId: crypto.randomUUID(), venta_id: null, monto: null }
}

export default function CobrosClientesSection({ onMessage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dialogAlert, setDialogAlert] = useState(null)
  const [fechaCobro, setFechaCobro] = useState(new Date())
  const [formaPago, setFormaPago] = useState('efectivo')
  const [comentario, setComentario] = useState('')
  const [comprobanteFile, setComprobanteFile] = useState(null)
  const [comprobanteUrlManual, setComprobanteUrlManual] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [lineas, setLineas] = useState([emptyLine()])
  const [saldos, setSaldos] = useState([])
  const [ventaLabels, setVentaLabels] = useState(new Map())
  const [viewCobro, setViewCobro] = useState(null)
  const cameraRef = useRef(null)
  const wizardClosingFromPopRef = useRef(false)
  const ignorePopRef = useAdminModalPopstate({
    isOpen: wizardOpen,
    onPopClose: () => {
      wizardClosingFromPopRef.current = true
      setWizardOpen(false)
      setDialogAlert(null)
    },
  })

  const refreshList = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cobros_cliente')
      .select(
        `
        id,
        fecha_cobro,
        forma_pago,
        comentario,
        comprobante_url,
        created_at,
        cobros_cliente_aplicacion ( id, venta_id, monto_aplicado )
      `
      )
      .order('fecha_cobro', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudieron cargar cobros: ${error.message}` })
      return
    }
    const list = (data || []).map((r) => {
      const apps = r.cobros_cliente_aplicacion || []
      const monto = apps.reduce((a, b) => a + Number(b.monto_aplicado || 0), 0)
      return { ...r, montoTotal: monto, numFacturas: apps.length, aplicaciones: apps }
    })
    setRows(list)
  }, [onMessage])

  const loadSaldos = useCallback(async () => {
    const { data: v, error: ev } = await supabase
      .from('v_ventas_saldo')
      .select('venta_id, saldo_pendiente, monto_total, monto_cobrado, fecha_venta, modalidad')
      .eq('modalidad', 'credito')
      .gt('saldo_pendiente', 0.005)
    if (ev) {
      onMessage?.({ ok: false, text: `Saldos de ventas: ${ev.message}` })
      return
    }
    const list = (v || []).filter((x) => Number(x.saldo_pendiente) > 0.0001)
    setSaldos(list)
    const ids = list.map((s) => s.venta_id)
    if (ids.length === 0) {
      setVentaLabels(new Map())
      return
    }
    const { data: ventas, error: e2 } = await supabase
      .from('ventas')
      .select(
        `
        id,
        origen_clienta,
        clienta_perfil_id,
        clienta_manual_id,
        profiles ( nombre, email ),
        clientas_manuales ( nombre, email )
      `
      )
      .in('id', ids)
    if (e2) {
      onMessage?.({ ok: false, text: `Ventas: ${e2.message}` })
      return
    }
    const m = new Map(
      (ventas || []).map((row) => {
        const name =
          row.origen_clienta === 'perfil'
            ? row.profiles?.nombre || row.profiles?.email || '—'
            : row.clientas_manuales?.nombre || row.clientas_manuales?.email || '—'
        return [row.id, name]
      })
    )
    setVentaLabels(m)
  }, [onMessage])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  const ventaOptions = useMemo(() => {
    return saldos.map((s) => {
      const name = ventaLabels.get(s.venta_id) || '—'
      const label = `${name} · ${formatDate(s.fecha_venta)} · saldo ${formatMoney(s.saldo_pendiente)}`
      return {
        value: s.venta_id,
        label,
        saldo: Number(s.saldo_pendiente),
        venta_id: s.venta_id,
      }
    })
  }, [saldos, ventaLabels])

  const optionsByVenta = useMemo(() => new Map(ventaOptions.map((o) => [o.venta_id, o])), [ventaOptions])

  function resetWizard() {
    setStep(0)
    setDialogAlert(null)
    setFechaCobro(new Date())
    setFormaPago('efectivo')
    setComentario('')
    setComprobanteFile(null)
    setComprobanteUrlManual('')
    setPreviewUrl('')
    setLineas([emptyLine()])
  }

  function openWizard() {
    resetWizard()
    loadSaldos()
    wizardClosingFromPopRef.current = false
    pushAdminModalHistory(ADMIN_MODAL_HISTORY_MARK.cobroWizard)
    setWizardOpen(true)
  }

  function closeCobroWizardUi() {
    if (wizardClosingFromPopRef.current) {
      wizardClosingFromPopRef.current = false
      return
    }
    peelAdminModalHistory(ADMIN_MODAL_HISTORY_MARK.cobroWizard, ignorePopRef)
    setWizardOpen(false)
    setDialogAlert(null)
  }

  function onFile(file) {
    if (!file) return
    setComprobanteFile(file)
    setComprobanteUrlManual('')
    setPreviewUrl(URL.createObjectURL(file))
  }

  function validateStep0() {
    if (!fechaCobro) return 'Indica la fecha del cobro.'
    if (!formaPago) return 'Selecciona la forma de pago.'
    return ''
  }

  function validateStep1() {
    if (ventaOptions.length === 0) return 'No hay ventas a crédito con saldo pendiente.'
    const withData = lineas.filter((l) => l.venta_id && Number(l.monto) > 0)
    if (withData.length < 1) return 'Agrega al menos una venta y monto mayor a 0.'
    const ids = withData.map((l) => l.venta_id)
    if (new Set(ids).size !== ids.length) return 'No repitas la misma venta en dos líneas.'

    for (const l of withData) {
      const max = optionsByVenta.get(l.venta_id)?.saldo
      if (max == null) return 'Venta no válida en el listado.'
      if (Number(l.monto) - max > 0.0001) {
        return `El monto no puede superar el saldo (${formatMoney(max)}).`
      }
    }
    return ''
  }

  function next() {
    const e0 = validateStep0()
    if (e0) {
      setDialogAlert({ severity: 'error', text: e0 })
      return
    }
    setDialogAlert(null)
    setStep(1)
  }

  function setLine(id, patch) {
    if (dialogAlert) setDialogAlert(null)
    setLineas((prev) => prev.map((l) => (l.rowId === id ? { ...l, ...patch } : l)))
  }

  function addLinea() {
    setLineas((prev) => [...prev, emptyLine()])
  }

  function removeLinea(id) {
    setLineas((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.rowId !== id)))
  }

  async function guardar() {
    const e0 = validateStep0()
    const e1 = validateStep1()
    if (e0 || e1) {
      setDialogAlert({ severity: 'error', text: e0 || e1 })
      return
    }
    setDialogAlert(null)
    setSaving(true)
    try {
      let url = String(comprobanteUrlManual || '').trim() || null
      if (comprobanteFile) {
        url = await uploadComprobanteToFacturasBucket(comprobanteFile, 'cobros_cliente')
      }
      const { data: cobro, error: ec } = await supabase
        .from('cobros_cliente')
        .insert({
          fecha_cobro: toIsoDate(fechaCobro),
          forma_pago: formaPago,
          comentario: String(comentario || '').trim() || null,
          comprobante_url: url,
        })
        .select('id')
        .single()
      if (ec) throw ec

      const withData = lineas.filter((l) => l.venta_id && Number(l.monto) > 0)
      const apps = withData.map((l) => ({
        cobro_cliente_id: cobro.id,
        venta_id: l.venta_id,
        monto_aplicado: Number(l.monto),
      }))
      const { error: ea } = await supabase.from('cobros_cliente_aplicacion').insert(apps)
      if (ea) {
        await supabase.from('cobros_cliente').delete().eq('id', cobro.id)
        throw ea
      }
      onMessage?.({ ok: true, text: 'Cobro registrado y aplicado a las ventas.' })
      peelAdminModalHistory(ADMIN_MODAL_HISTORY_MARK.cobroWizard, ignorePopRef)
      setWizardOpen(false)
      resetWizard()
      refreshList()
    } catch (err) {
      setDialogAlert({
        severity: 'error',
        text:
          err?.message?.includes('Bucket not found') || err?.message?.includes('not found')
            ? 'Crea el bucket de Storage `facturas` o usa solo URL de comprobante.'
            : err?.message?.includes('column') && err?.message?.includes('forma_pago')
              ? 'Falta la columna `forma_pago` en `cobros_cliente`. Ejecuta en Supabase el script `supabase/006_cobros_forma_pago.sql`.'
              : err?.message || 'No se pudo guardar.',
      })
    } finally {
      setSaving(false)
    }
  }

  const filePickerPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
            style={{ display: 'none' }}
            aria-hidden
            tabIndex={-1}
          />,
          document.body
        )
      : null

  return (
    <div className="admin-panel">
      {filePickerPortal}
      <h2>Cobros de clientas</h2>
      <p className="lead">
        Registra cobros sobre ventas a crédito. Indica la forma de pago (efectivo, transferencia o
        tarjeta) y aplica el monto a una o varias facturas; no puede exceder el saldo de cada venta.
      </p>
      <div className="admin-catalog-head">
        <Button
          type="button"
          icon="pi pi-refresh"
          label="Actualizar"
          outlined
          severity="secondary"
          onClick={refreshList}
        />
        <Button type="button" icon="pi pi-plus" label="Registrar cobro" onClick={openWizard} />
      </div>

      <div className="admin-catalog-card">
        <DataTable
          value={rows}
          dataKey="id"
          loading={loading}
          paginator
          rows={10}
          size="small"
          responsiveLayout="scroll"
          emptyMessage="Aún no hay cobros registrados."
        >
          <Column field="fecha_cobro" header="Fecha" body={(r) => formatDate(r.fecha_cobro)} sortable />
          <Column
            header="Forma de pago"
            body={(r) => formaPagoLabel(r.forma_pago) || '—'}
            style={{ width: '10rem' }}
          />
          <Column
            header="Monto aplicado"
            body={(r) => formatMoney(r.montoTotal)}
            style={{ width: '9rem' }}
            sortable
          />
          <Column header="Ventas" body={(r) => r.numFacturas} style={{ width: '7rem' }} />
          <Column field="comentario" header="Comentario" body={(r) => r.comentario || '—'} />
          <Column
            header="Comprobante"
            style={{ width: '8rem' }}
            body={(r) =>
              r.comprobante_url ? (
                <a
                  href={r.comprobante_url}
                  target="_blank"
                  rel="noreferrer"
                  className="admin-link-inline"
                >
                  Ver
                </a>
              ) : (
                '—'
              )
            }
          />
          <Column
            style={{ width: '5rem' }}
            body={(r) => (
              <Button
                type="button"
                icon="pi pi-eye"
                rounded
                text
                severity="secondary"
                aria-label="Detalle"
                onClick={() => setViewCobro(r)}
              />
            )}
          />
        </DataTable>
      </div>

      <Dialog
        header="Nuevo cobro de clienta"
        visible={wizardOpen}
        style={{ width: 'min(52rem, 96vw)' }}
        onHide={closeCobroWizardUi}
        modal
        dismissableMask={false}
        closable={false}
        closeOnEscape={false}
        focusOnShow={false}
        draggable={false}
        resizable={false}
      >
        <div className="admin-compra-wizard">
          {dialogAlert ? (
            <Message severity={dialogAlert.severity} text={dialogAlert.text} className="admin-pr-message" />
          ) : null}
          <Steps model={WIZARD_STEPS} activeIndex={step} readOnly className="admin-compra-steps" />
          {step === 0 ? (
            <div className="admin-compra-step-grid">
              <div>
                <label htmlFor="cc-fecha">Fecha del cobro</label>
                <Calendar
                  id="cc-fecha"
                  value={fechaCobro}
                  onChange={(e) => setFechaCobro(e.value)}
                  dateFormat="dd/mm/yy"
                  showIcon
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="cc-forma">Forma de pago</label>
                <Dropdown
                  id="cc-forma"
                  value={formaPago}
                  options={FORMA_PAGO_OPTIONS}
                  onChange={(e) => setFormaPago(e.value)}
                  className="w-full"
                />
              </div>
              <div className="admin-compra-field-full">
                <label htmlFor="cc-comentario">Comentario (opcional)</label>
                <InputTextarea
                  id="cc-comentario"
                  rows={3}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="admin-compra-field-full">
                <label>Comprobante (foto o archivo, opcional)</label>
                <Button
                  type="button"
                  icon="pi pi-camera"
                  label="Tomar o elegir archivo"
                  onClick={() => cameraRef.current?.click()}
                />
              </div>
              <div className="admin-compra-field-full">
                <label htmlFor="cc-url">URL de comprobante (opcional)</label>
                <InputText
                  id="cc-url"
                  value={comprobanteUrlManual}
                  onChange={(e) => {
                    setComprobanteUrlManual(e.target.value)
                    if (e.target.value) {
                      setComprobanteFile(null)
                      setPreviewUrl('')
                    }
                  }}
                  placeholder="https://..."
                  className="w-full"
                />
              </div>
              {previewUrl ? (
                <div className="admin-compra-field-full">
                  <img src={previewUrl} alt="Vista previa" className="admin-compra-factura-preview" />
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              {ventaOptions.length === 0 ? (
                <p className="lead">No hay ventas a crédito con saldo.</p>
              ) : (
                <>
                  {lineas.map((line, idx) => (
                    <div key={line.rowId} className="admin-venta-line" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span className="admin-compra-detalle-index">#{idx + 1}</span>
                      <Dropdown
                        value={line.venta_id}
                        options={ventaOptions}
                        optionLabel="label"
                        optionValue="venta_id"
                        onChange={(e) => setLine(line.rowId, { venta_id: e.value, monto: null })}
                        placeholder="Venta a crédito"
                        filter
                        className="w-full"
                        style={{ minWidth: 'min(20rem, 100%)' }}
                      />
                      <InputNumber
                        value={line.monto}
                        onValueChange={(e) => setLine(line.rowId, { monto: e.value ?? null })}
                        mode="currency"
                        currency="USD"
                        locale="es-SV"
                        min={0.01}
                        minFractionDigits={2}
                        maxFractionDigits={2}
                        placeholder="Monto"
                        disabled={!line.venta_id}
                      />
                      {line.venta_id ? (
                        <small className="admin-compra-help">
                          Saldo: {formatMoney(optionsByVenta.get(line.venta_id)?.saldo)}
                        </small>
                      ) : null}
                      <Button
                        type="button"
                        icon="pi pi-trash"
                        rounded
                        text
                        severity="danger"
                        onClick={() => removeLinea(line.rowId)}
                        disabled={lineas.length <= 1}
                      />
                    </div>
                  ))}
                  <div className="admin-compra-detalle-actions" style={{ marginTop: '0.75rem' }}>
                    <Button type="button" icon="pi pi-plus" label="Otra venta" onClick={addLinea} />
                  </div>
                </>
              )}
            </div>
          )}
          <div className="admin-catalog-dialog-actions">
            <Button type="button" label="Cancelar" severity="secondary" text onClick={closeCobroWizardUi} />
            {step > 0 ? (
              <Button type="button" label="Atrás" outlined severity="secondary" onClick={() => setStep(0)} />
            ) : null}
            {step < 1 ? (
              <Button type="button" label="Siguiente" icon="pi pi-arrow-right" iconPos="right" onClick={next} />
            ) : (
              <Button
                type="button"
                label="Guardar cobro"
                icon="pi pi-check"
                loading={saving}
                disabled={ventaOptions.length === 0}
                onClick={guardar}
              />
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        header="Detalle del cobro"
        visible={Boolean(viewCobro)}
        style={{ width: 'min(40rem, 96vw)' }}
        onHide={() => setViewCobro(null)}
        modal
      >
        {viewCobro ? (
          <div className="admin-compra-view">
            <p>
              <strong>Fecha:</strong> {formatDate(viewCobro.fecha_cobro)}
            </p>
            <p>
              <strong>Forma de pago:</strong> {formaPagoLabel(viewCobro.forma_pago)}
            </p>
            <p>
              <strong>Comentario:</strong> {viewCobro.comentario || '—'}
            </p>
            {viewCobro.comprobante_url ? (
              <p>
                <a
                  href={viewCobro.comprobante_url}
                  target="_blank"
                  rel="noreferrer"
                  className="admin-link-inline"
                >
                  Abrir comprobante
                </a>
              </p>
            ) : null}
            <DataTable value={viewCobro.aplicaciones || []} dataKey="id" size="small" responsiveLayout="scroll">
              <Column field="venta_id" header="ID venta" />
              <Column header="Monto" body={(a) => formatMoney(a.monto_aplicado)} />
            </DataTable>
            <p className="admin-compra-total-inline">
              <strong>Total aplicado:</strong> {formatMoney(viewCobro.montoTotal)}
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
