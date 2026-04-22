import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Column } from 'primereact/column'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Message } from 'primereact/message'
import { SelectButton } from 'primereact/selectbutton'
import { Steps } from 'primereact/steps'
import { supabase } from '../../lib/supabaseClient'
import { uploadComprobanteToFacturasBucket } from '../../lib/uploadComprobanteFacturas'

const PAGO_FORMA_OPTIONS = [
  { label: 'Efectivo', value: 'efectivo' },
  { label: 'Transferencia', value: 'transferencia' },
  { label: 'Tarjeta', value: 'tarjeta' },
]

const ORIGEN_OPTIONS = [
  { label: 'Clienta registrada', value: 'perfil' },
  { label: 'Clienta manual', value: 'manual' },
]

const MODALIDAD_OPTIONS = [
  { label: 'Contado', value: 'contado' },
  { label: 'Crédito', value: 'credito' },
]

function emptyHeader() {
  return {
    origen_clienta: 'perfil',
    clienta_perfil_id: null,
    clienta_manual_id: null,
    fecha_venta: new Date(),
    modalidad: 'contado',
    dias_credito: 0,
    comentario: '',
  }
}

function emptyLine() {
  return {
    rowId: crypto.randomUUID(),
    servicio_id: null,
    cantidad: 1,
    precio_unitario: null,
  }
}

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

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es')
}

function calcTotal(lines = []) {
  return lines.reduce((acc, line) => {
    const q = Number(line.cantidad || 0)
    const p = Number(line.precio_unitario || 0)
    return acc + q * p
  }, 0)
}

function emptyPagoVenta() {
  return {
    forma_pago: 'efectivo',
    comprobanteFile: null,
    comprobanteUrlManual: '',
    preview: '',
  }
}

export default function VentasSection({ onMessage }) {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [manuales, setManuales] = useState([])
  const [servicios, setServicios] = useState([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [dialogAlert, setDialogAlert] = useState(null)
  const [saving, setSaving] = useState(false)
  const [header, setHeader] = useState(emptyHeader())
  const [detalle, setDetalle] = useState([emptyLine()])
  const [viewVenta, setViewVenta] = useState(null)
  const [pagoVenta, setPagoVenta] = useState(() => emptyPagoVenta())
  const pagoVentaCameraRef = useRef(null)

  const profilesOptions = useMemo(
    () => profiles.map((p) => ({ label: p.nombre || p.email || p.id, value: p.id })),
    [profiles]
  )
  const manualesOptions = useMemo(
    () => manuales.map((m) => ({ label: m.nombre || m.email || m.id, value: m.id })),
    [manuales]
  )
  const serviciosOptions = useMemo(
    () =>
      servicios.map((s) => ({
        label: `${s.codigo} - ${s.descripcion}`,
        value: s.id,
      })),
    [servicios]
  )
  const serviciosById = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios])

  async function refreshVentas() {
    setLoading(true)
    const { data, error } = await supabase
      .from('ventas')
      .select(
        `
        id,
        origen_clienta,
        clienta_perfil_id,
        clienta_manual_id,
        fecha_venta,
        modalidad,
        dias_credito,
        comentario,
        forma_pago,
        pago_comprobante_url,
        created_at,
        profiles ( nombre, email ),
        clientas_manuales ( nombre, email, telefono ),
        ventas_detalle (
          id,
          servicio_id,
          cantidad,
          precio_unitario,
          orden,
          servicios ( codigo, descripcion )
        )
      `
      )
      .order('fecha_venta', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudieron cargar ventas: ${error.message}` })
      return
    }
    const normalized = (data || []).map((row) => {
      const det = [...(row.ventas_detalle || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      const clienta =
        row.origen_clienta === 'perfil'
          ? row.profiles?.nombre || row.profiles?.email || '—'
          : row.clientas_manuales?.nombre || row.clientas_manuales?.email || '—'
      return {
        ...row,
        ventas_detalle: det,
        clienta_nombre: clienta,
        total: calcTotal(det),
      }
    })
    setVentas(normalized)
  }

  async function refreshLookups() {
    const [rProfiles, rManuales, rServicios] = await Promise.all([
      supabase.from('profiles').select('id,nombre,email').eq('role', 'clienta').order('nombre', { ascending: true }),
      supabase.from('clientas_manuales').select('id,nombre,email,activa').eq('activa', true).order('nombre', { ascending: true }),
      supabase.from('servicios').select('id,codigo,descripcion,precio_desde,activo').eq('activo', true).order('codigo', { ascending: true }),
    ])
    if (rProfiles.error) onMessage?.({ ok: false, text: `No se pudieron cargar clientas registradas: ${rProfiles.error.message}` })
    if (rManuales.error) onMessage?.({ ok: false, text: `No se pudieron cargar clientas manuales: ${rManuales.error.message}` })
    if (rServicios.error) onMessage?.({ ok: false, text: `No se pudieron cargar servicios: ${rServicios.error.message}` })
    setProfiles(rProfiles.data || [])
    setManuales(rManuales.data || [])
    setServicios(rServicios.data || [])
  }

  useEffect(() => {
    refreshVentas()
    refreshLookups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (header.modalidad === 'credito' && wizardStep > 1) {
      setWizardStep(1)
    }
  }, [header.modalidad, wizardStep])

  const stepsVenta = useMemo(() => {
    const base = [{ label: 'Encabezado' }, { label: 'Detalle' }]
    if (header.modalidad === 'contado') {
      base.push({ label: 'Pago' })
    }
    return base
  }, [header.modalidad])

  const lastVentaStep = header.modalidad === 'contado' ? 2 : 1

  function resetWizard() {
    setWizardStep(0)
    setDialogAlert(null)
    setHeader(emptyHeader())
    setDetalle([emptyLine()])
    setPagoVenta(emptyPagoVenta())
  }

  function openWizard() {
    resetWizard()
    setWizardOpen(true)
  }

  function setHeaderField(field, value) {
    if (dialogAlert) setDialogAlert(null)
    setHeader((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'modalidad' && value === 'contado') {
        next.dias_credito = 0
      }
      return next
    })
  }

  function setDetalleLine(rowId, patch) {
    if (dialogAlert) setDialogAlert(null)
    setDetalle((prev) => prev.map((line) => (line.rowId === rowId ? { ...line, ...patch } : line)))
  }

  function onSelectOrigen(value) {
    setDialogAlert(null)
    if (value === 'perfil') {
      setHeader((prev) => ({
        ...prev,
        origen_clienta: 'perfil',
        clienta_manual_id: null,
      }))
      return
    }
    setHeader((prev) => ({
      ...prev,
      origen_clienta: 'manual',
      clienta_perfil_id: null,
    }))
  }

  function onPagoVentaFile(file) {
    if (!file) return
    setPagoVenta((p) => ({
      ...p,
      comprobanteFile: file,
      comprobanteUrlManual: '',
      preview: URL.createObjectURL(file),
    }))
  }

  function clearPagoVentaComprob() {
    setPagoVenta((p) => ({ ...p, comprobanteFile: null, preview: '' }))
  }

  function onSelectServicio(rowId, servicioId) {
    const servicio = serviciosById.get(servicioId)
    setDetalleLine(rowId, {
      servicio_id: servicioId,
      precio_unitario: Number(servicio?.precio_desde || 0),
    })
  }

  function addLine() {
    setDetalle((prev) => [...prev, emptyLine()])
  }

  function removeLine(rowId) {
    setDetalle((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((line) => line.rowId !== rowId)
    })
  }

  function validateStep(step) {
    if (step === 0) {
      if (!header.fecha_venta) return 'Selecciona la fecha de la venta.'
      if (header.origen_clienta === 'perfil' && !header.clienta_perfil_id) {
        return 'Selecciona una clienta registrada.'
      }
      if (header.origen_clienta === 'manual' && !header.clienta_manual_id) {
        return 'Selecciona una clienta manual.'
      }
      if (!header.modalidad) return 'Selecciona contado o crédito.'
      if (Number(header.dias_credito) < 0 || Number.isNaN(Number(header.dias_credito))) {
        return 'Días de crédito inválidos.'
      }
      if (header.modalidad === 'contado' && Number(header.dias_credito) !== 0) {
        return 'En contado los días de crédito deben ser 0.'
      }
      return ''
    }
    if (step === 1) {
      if (detalle.length < 1) return 'Debes agregar al menos una línea.'
      const invalid = detalle.find(
        (line) =>
          !line.servicio_id ||
          Number(line.cantidad) <= 0 ||
          Number.isNaN(Number(line.cantidad)) ||
          Number(line.precio_unitario) < 0 ||
          Number.isNaN(Number(line.precio_unitario))
      )
      if (invalid) return 'Cada línea requiere servicio, cantidad > 0 y precio válido.'
      return ''
    }
    if (step === 2) {
      if (!pagoVenta.forma_pago) return 'Indica la forma de pago recibida.'
      return ''
    }
    return ''
  }

  function nextStep() {
    const err = validateStep(wizardStep)
    if (err) {
      setDialogAlert({ severity: 'error', text: err })
      return
    }
    setDialogAlert(null)
    setWizardStep((s) => Math.min(lastVentaStep, s + 1))
  }

  function prevStep() {
    setWizardStep((s) => Math.max(0, s - 1))
  }

  async function saveVenta() {
    const err0 = validateStep(0)
    const err1 = validateStep(1)
    const needPago = header.modalidad === 'contado'
    const err2 = needPago ? validateStep(2) : ''
    if (err0 || err1 || err2) {
      setDialogAlert({ severity: 'error', text: err0 || err1 || err2 })
      return
    }
    if (wizardStep !== lastVentaStep) {
      setDialogAlert({ severity: 'error', text: 'Usa “Siguiente” hasta el último paso antes de guardar.' })
      return
    }
    setDialogAlert(null)
    setSaving(true)
    try {
      let pagoComprobUrl = null
      if (needPago) {
        if (pagoVenta.comprobanteFile) {
          pagoComprobUrl = await uploadComprobanteToFacturasBucket(
            pagoVenta.comprobanteFile,
            'cobros_cliente'
          )
        } else if (pagoVenta.comprobanteUrlManual?.trim()) {
          pagoComprobUrl = pagoVenta.comprobanteUrlManual.trim()
        }
      }
      const payloadVenta = {
        origen_clienta: header.origen_clienta,
        clienta_perfil_id: header.origen_clienta === 'perfil' ? header.clienta_perfil_id : null,
        clienta_manual_id: header.origen_clienta === 'manual' ? header.clienta_manual_id : null,
        fecha_venta: toIsoDate(header.fecha_venta),
        modalidad: header.modalidad,
        dias_credito: Number(header.dias_credito) || 0,
        comentario: String(header.comentario || '').trim() || null,
        ...(needPago
          ? { forma_pago: pagoVenta.forma_pago, pago_comprobante_url: pagoComprobUrl }
          : {}),
      }
      const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .insert(payloadVenta)
        .select('id')
        .single()
      if (ventaError) {
        if (
          ventaError.message?.includes('forma_pago') ||
          ventaError.message?.includes('pago_comprobante') ||
          ventaError.message?.includes('column')
        ) {
          throw new Error(
            'Faltan columnas de pago en `ventas`. Ejecuta en Supabase `supabase/007_contado_pago_venta_y_proveedor.sql`.'
          )
        }
        throw ventaError
      }

      const detailPayload = detalle.map((line, i) => ({
        venta_id: venta.id,
        servicio_id: line.servicio_id,
        cantidad: Number(line.cantidad),
        precio_unitario: Number(line.precio_unitario),
        orden: i + 1,
      }))
      const { error: detError } = await supabase.from('ventas_detalle').insert(detailPayload)
      if (detError) {
        await supabase.from('ventas').delete().eq('id', venta.id)
        throw detError
      }

      onMessage?.({ ok: true, text: 'Venta registrada correctamente.' })
      setWizardOpen(false)
      resetWizard()
      refreshVentas()
    } catch (error) {
      setDialogAlert({ severity: 'error', text: error?.message || 'No se pudo guardar la venta.' })
    } finally {
      setSaving(false)
    }
  }

  function askDelete(row) {
    confirmDialog({
      header: 'Eliminar venta',
      message: `Esta acción eliminará la venta de ${row.clienta_nombre} del ${formatDate(row.fecha_venta)}.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('ventas').delete().eq('id', row.id)
        if (error) {
          onMessage?.({ ok: false, text: error.message })
          return
        }
        onMessage?.({ ok: true, text: 'Venta eliminada.' })
        refreshVentas()
      },
    })
  }

  function renderStepContent() {
    if (wizardStep === 0) {
      return (
        <div className="admin-compra-step-grid">
          <div className="admin-compra-field-full">
            <label>Tipo de clienta</label>
            <SelectButton
              value={header.origen_clienta}
              options={ORIGEN_OPTIONS}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => onSelectOrigen(e.value)}
            />
          </div>
          <div className="admin-compra-field-full">
            <label htmlFor="venta-clienta">
              {header.origen_clienta === 'perfil' ? 'Clienta registrada' : 'Clienta manual'}
            </label>
            {header.origen_clienta === 'perfil' ? (
              <Dropdown
                id="venta-clienta"
                value={header.clienta_perfil_id}
                options={profilesOptions}
                onChange={(e) => setHeaderField('clienta_perfil_id', e.value)}
                placeholder="Selecciona clienta registrada"
                filter
                className="w-full"
              />
            ) : (
              <Dropdown
                id="venta-clienta"
                value={header.clienta_manual_id}
                options={manualesOptions}
                onChange={(e) => setHeaderField('clienta_manual_id', e.value)}
                placeholder="Selecciona clienta manual"
                filter
                className="w-full"
              />
            )}
          </div>
          <div>
            <label htmlFor="venta-fecha">Fecha de venta</label>
            <Calendar
              id="venta-fecha"
              value={header.fecha_venta}
              onChange={(e) => setHeaderField('fecha_venta', e.value)}
              dateFormat="dd/mm/yy"
              showIcon
              className="w-full"
            />
          </div>
          <div className="admin-compra-field-full">
            <label>Modalidad de venta</label>
            <SelectButton
              value={header.modalidad}
              options={MODALIDAD_OPTIONS}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setHeaderField('modalidad', e.value)}
            />
          </div>
          {header.modalidad === 'credito' ? (
            <div>
              <label htmlFor="venta-credito">Días de crédito</label>
              <InputNumber
                id="venta-credito"
                value={header.dias_credito}
                onValueChange={(e) => setHeaderField('dias_credito', e.value ?? 0)}
                min={0}
                useGrouping={false}
                className="w-full"
              />
            </div>
          ) : null}
          <div className="admin-compra-field-full">
            <label htmlFor="venta-comentario">Comentario (opcional)</label>
            <InputTextarea
              id="venta-comentario"
              rows={3}
              value={header.comentario}
              onChange={(e) => setHeaderField('comentario', e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      )
    }

    if (wizardStep === 1) {
      return (
      <div className="admin-venta-lines-wrap">
        {detalle.map((line, idx) => (
          <div key={line.rowId} className="admin-venta-line">
            <div className="admin-compra-detalle-index">#{idx + 1}</div>
            <Dropdown
              value={line.servicio_id}
              options={serviciosOptions}
              onChange={(e) => onSelectServicio(line.rowId, e.value)}
              placeholder="Servicio"
              filter
            />
            <InputNumber
              value={line.cantidad}
              onValueChange={(e) => setDetalleLine(line.rowId, { cantidad: e.value ?? 1 })}
              min={1}
              useGrouping={false}
              placeholder="Cant."
            />
            <InputNumber
              value={line.precio_unitario}
              onValueChange={(e) => setDetalleLine(line.rowId, { precio_unitario: e.value ?? 0 })}
              mode="currency"
              currency="USD"
              locale="es-SV"
              min={0}
              minFractionDigits={2}
              maxFractionDigits={2}
              placeholder="Precio"
            />
            <Button
              type="button"
              icon="pi pi-trash"
              rounded
              text
              severity="danger"
              aria-label="Eliminar línea"
              onClick={() => removeLine(line.rowId)}
              disabled={detalle.length <= 1}
            />
          </div>
        ))}
        <div className="admin-compra-detalle-actions">
          <Button type="button" icon="pi pi-plus" label="Agregar línea" onClick={addLine} />
          <span className="admin-compra-total">Total estimado: ${calcTotal(detalle).toFixed(2)}</span>
        </div>
      </div>
      )
    }

    return (
      <div className="admin-compra-step-grid">
        <p className="admin-compra-help" style={{ marginTop: 0 }}>
          Pago inmediato por <strong>${calcTotal(detalle).toFixed(2)}</strong> (mismo total de la venta).
        </p>
        <div>
          <label htmlFor="venta-pago-forma">Forma de pago</label>
          <Dropdown
            id="venta-pago-forma"
            value={pagoVenta.forma_pago}
            options={PAGO_FORMA_OPTIONS}
            onChange={(e) => {
              if (dialogAlert) setDialogAlert(null)
              setPagoVenta((p) => ({ ...p, forma_pago: e.value }))
            }}
            className="w-full"
          />
        </div>
        <div className="admin-compra-field-full">
          <label>Comprobante (opcional)</label>
          <input
            ref={pagoVentaCameraRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => {
              onPagoVentaFile(e.target.files?.[0])
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
          <Button
            type="button"
            icon="pi pi-camera"
            label="Tomar o elegir archivo"
            onClick={() => pagoVentaCameraRef.current?.click()}
          />
        </div>
        <div className="admin-compra-field-full">
          <label htmlFor="venta-pago-url">URL de comprobante (opcional)</label>
          <InputText
            id="venta-pago-url"
            value={pagoVenta.comprobanteUrlManual}
            onChange={(e) => {
              if (dialogAlert) setDialogAlert(null)
              setPagoVenta((p) => ({
                ...p,
                comprobanteUrlManual: e.target.value,
                comprobanteFile: e.target.value ? null : p.comprobanteFile,
                preview: e.target.value ? '' : p.preview,
              }))
            }}
            placeholder="https://..."
            className="w-full"
          />
        </div>
        {pagoVenta.preview ? (
          <div className="admin-compra-field-full">
            <img src={pagoVenta.preview} alt="Comprobante" className="admin-compra-factura-preview" />
            <div className="admin-compra-detalle-actions">
              <Button type="button" label="Quitar" severity="secondary" text onClick={clearPagoVentaComprob} />
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Ventas</h2>
      <p className="lead">
        Registra ventas: encabezado, detalle; si la venta es al contado, un paso extra para forma de
        pago y comprobante. Las ventas a crédito se cobran luego en &quot;Cobros de clientas&quot;.
      </p>

      <div className="admin-catalog-head">
        <Button type="button" icon="pi pi-refresh" label="Actualizar" outlined severity="secondary" onClick={refreshVentas} />
        <Button type="button" icon="pi pi-plus" label="Nueva venta" onClick={openWizard} />
      </div>

      <div className="admin-catalog-card">
        <DataTable
          value={ventas}
          dataKey="id"
          paginator
          rows={10}
          rowsPerPageOptions={[10, 20, 40]}
          loading={loading}
          responsiveLayout="scroll"
          emptyMessage="No hay ventas registradas."
          size="small"
        >
          <Column field="fecha_venta" header="Fecha" body={(row) => formatDate(row.fecha_venta)} sortable />
          <Column
            header="Origen"
            body={(row) => (row.origen_clienta === 'perfil' ? 'Registrada' : 'Manual')}
            style={{ width: '8rem' }}
          />
          <Column field="clienta_nombre" header="Clienta" sortable />
          <Column
            header="Modalidad"
            body={(row) => (row.modalidad === 'credito' ? 'Crédito' : 'Contado')}
            style={{ width: '7.5rem' }}
          />
          <Column
            field="dias_credito"
            header="Días créd."
            style={{ width: '6.5rem' }}
            body={(row) => (row.modalidad === 'credito' ? row.dias_credito : '—')}
          />
          <Column
            header="Líneas"
            body={(row) => row.ventas_detalle?.length || 0}
            style={{ width: '6rem' }}
          />
          <Column
            header="Total"
            body={(row) => `$${Number(row.total || 0).toFixed(2)}`}
            sortable
            style={{ width: '8rem' }}
          />
          <Column
            header=""
            style={{ width: '8rem' }}
            body={(row) => (
              <div className="admin-catalog-actions">
                <Button
                  type="button"
                  icon="pi pi-eye"
                  rounded
                  text
                  severity="secondary"
                  aria-label="Ver"
                  onClick={() => setViewVenta(row)}
                />
                <Button
                  type="button"
                  icon="pi pi-trash"
                  rounded
                  text
                  severity="danger"
                  aria-label="Eliminar"
                  onClick={() => askDelete(row)}
                />
              </div>
            )}
          />
        </DataTable>
      </div>

      <Dialog
        header="Nueva venta"
        visible={wizardOpen}
        style={{ width: 'min(56rem, 96vw)' }}
        onHide={() => {
          setWizardOpen(false)
          setDialogAlert(null)
        }}
        modal
        dismissableMask={false}
      >
        <div className="admin-compra-wizard">
          {dialogAlert ? <Message severity={dialogAlert.severity} text={dialogAlert.text} className="admin-pr-message" /> : null}
          <Steps model={stepsVenta} activeIndex={wizardStep} readOnly className="admin-compra-steps" />
          <div className="admin-compra-step-content">{renderStepContent()}</div>
          <div className="admin-catalog-dialog-actions">
            <Button type="button" label="Cancelar" severity="secondary" text onClick={() => setWizardOpen(false)} />
            {wizardStep > 0 ? (
              <Button type="button" label="Atrás" outlined severity="secondary" onClick={prevStep} />
            ) : null}
            {wizardStep < lastVentaStep ? (
              <Button type="button" label="Siguiente" icon="pi pi-arrow-right" iconPos="right" onClick={nextStep} />
            ) : (
              <Button type="button" label="Guardar venta" icon="pi pi-check" loading={saving} onClick={saveVenta} />
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        header="Detalle de venta"
        visible={Boolean(viewVenta)}
        style={{ width: 'min(48rem, 96vw)' }}
        onHide={() => setViewVenta(null)}
        modal
      >
        {viewVenta ? (
          <div className="admin-compra-view">
            <p>
              <strong>Clienta:</strong> {viewVenta.clienta_nombre} ({viewVenta.origen_clienta === 'perfil' ? 'registrada' : 'manual'})
            </p>
            <p>
              <strong>Fecha:</strong> {formatDate(viewVenta.fecha_venta)} · <strong>Modalidad:</strong>{' '}
              {viewVenta.modalidad === 'credito' ? 'Crédito' : 'Contado'}
              {viewVenta.modalidad === 'credito' ? (
                <>
                  {' '}
                  · <strong>Días crédito:</strong> {viewVenta.dias_credito}
                </>
              ) : null}
            </p>
            {viewVenta.modalidad === 'contado' ? (
              <p>
                <strong>Forma de pago (contado):</strong>{' '}
                {PAGO_FORMA_OPTIONS.find((o) => o.value === viewVenta.forma_pago)?.label ||
                  viewVenta.forma_pago ||
                  '—'}
                {viewVenta.pago_comprobante_url ? (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={viewVenta.pago_comprobante_url}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-link-inline"
                    >
                      Comprobante
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            <p>
              <strong>Registrada:</strong> {formatDateTime(viewVenta.created_at)}
            </p>
            <p>
              <strong>Comentario:</strong> {viewVenta.comentario || '—'}
            </p>
            <DataTable value={viewVenta.ventas_detalle || []} dataKey="id" size="small" responsiveLayout="scroll">
              <Column field="orden" header="#" style={{ width: '4rem' }} />
              <Column
                header="Servicio"
                body={(row) =>
                  row.servicios?.codigo
                    ? `${row.servicios.codigo} - ${row.servicios.descripcion || ''}`
                    : row.servicio_id
                }
              />
              <Column field="cantidad" header="Cant." style={{ width: '5rem' }} />
              <Column
                header="Precio"
                body={(row) => `$${Number(row.precio_unitario || 0).toFixed(2)}`}
                style={{ width: '8rem' }}
              />
              <Column
                header="Subtotal"
                body={(row) => `$${(Number(row.cantidad || 0) * Number(row.precio_unitario || 0)).toFixed(2)}`}
                style={{ width: '8rem' }}
              />
            </DataTable>
            <p className="admin-compra-total-inline">
              <strong>Total:</strong> ${Number(viewVenta.total || 0).toFixed(2)}
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
