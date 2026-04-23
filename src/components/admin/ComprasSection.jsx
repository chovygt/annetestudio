import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { prepareFileForFacturasUpload } from '../../lib/resizeImageForUpload.js'
import { uploadComprobanteToFacturasBucket } from '../../lib/uploadComprobanteFacturas'
import {
  ADMIN_MODAL_HISTORY_MARK,
  peelAdminModalHistory,
  pushAdminModalHistory,
  useAdminModalPopstate,
} from '../../lib/adminWizardHistory.js'
import { adminInputNumberCurrencyProps, formatMoneyGtq } from '../../lib/adminFormatMoney.js'
import {
  fetchCuentasBancariasOptions,
  formaPagoRequiereCuentaBancaria,
  insertMovimientoAutomaticoEgresoPago,
} from '../../lib/movimientosBancarios.js'

const PAGO_FORMA_OPTIONS = [
  { label: 'Efectivo', value: 'efectivo' },
  { label: 'Transferencia', value: 'transferencia' },
  { label: 'Tarjeta', value: 'tarjeta' },
]

const MODALIDAD_OPTIONS = [
  { label: 'Contado', value: 'contado' },
  { label: 'Crédito', value: 'credito' },
]

function emptyCompraHeader() {
  return {
    proveedor_id: null,
    fecha_compra: new Date(),
    modalidad: 'contado',
    dias_credito: 0,
    comentario: '',
    foto_factura_url: '',
  }
}

function emptyDetalleLine() {
  return {
    rowId: crypto.randomUUID(),
    descripcion: '',
    monto: null,
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

function calcTotal(detalle = []) {
  return detalle.reduce((acc, line) => acc + Number(line.monto || 0), 0)
}

function emptyPagoInmediato() {
  return {
    fecha_pago: new Date(),
    forma_pago: 'efectivo',
    cuenta_bancaria_id: null,
    comentario: '',
    comprobanteFile: null,
    comprobanteUrlManual: '',
    preview: '',
  }
}

export default function ComprasSection({ onMessage }) {
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(false)
  const [proveedores, setProveedores] = useState([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [header, setHeader] = useState(emptyCompraHeader())
  const [detalle, setDetalle] = useState([emptyDetalleLine()])
  const [dialogAlert, setDialogAlert] = useState(null)
  const [facturaFile, setFacturaFile] = useState(null)
  const [facturaPreviewUrl, setFacturaPreviewUrl] = useState('')
  const [viewCompra, setViewCompra] = useState(null)
  const cameraInputRef = useRef(null)
  const pagoCameraRef = useRef(null)
  const wizardClosingFromPopRef = useRef(false)
  const [pagoInmediato, setPagoInmediato] = useState(() => emptyPagoInmediato())
  const [cuentasBancariasOptions, setCuentasBancariasOptions] = useState([])
  const ignorePopRef = useAdminModalPopstate({
    isOpen: wizardOpen,
    onPopClose: () => {
      wizardClosingFromPopRef.current = true
      setWizardOpen(false)
      setDialogAlert(null)
    },
  })

  const proveedoresOptions = useMemo(
    () => proveedores.map((p) => ({ label: p.nombre, value: p.id })),
    [proveedores]
  )

  const stepsModel = useMemo(() => {
    const base = [{ label: 'Encabezado' }, { label: 'Detalle' }, { label: 'Factura' }]
    if (header.modalidad === 'contado') {
      base.push({ label: 'Pago' })
    }
    return base
  }, [header.modalidad])

  const lastStepIndex = header.modalidad === 'contado' ? 3 : 2

  async function refreshCompras() {
    setLoading(true)
    const { data, error } = await supabase
      .from('compras')
      .select(
        `
        id,
        proveedor_id,
        fecha_compra,
        modalidad,
        dias_credito,
        comentario,
        foto_factura_url,
        created_at,
        proveedores ( nombre ),
        compras_detalle ( id, descripcion, monto, orden )
      `
      )
      .order('fecha_compra', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudieron cargar compras: ${error.message}` })
      return
    }
    const normalized = (data || []).map((row) => {
      const detalleSorted = [...(row.compras_detalle || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      return {
        ...row,
        compras_detalle: detalleSorted,
        proveedor_nombre: row.proveedores?.nombre || '—',
        total: calcTotal(detalleSorted),
      }
    })
    setCompras(normalized)
  }

  async function refreshProveedores() {
    const { data, error } = await supabase
      .from('proveedores')
      .select('id,nombre,activo')
      .eq('activo', true)
      .order('nombre', { ascending: true })
    if (error) {
      onMessage?.({ ok: false, text: `No se pudieron cargar proveedores activos: ${error.message}` })
      return
    }
    setProveedores(data || [])
  }

  useEffect(() => {
    refreshCompras()
    refreshProveedores()
    ;(async () => {
      try {
        setCuentasBancariasOptions(await fetchCuentasBancariasOptions(supabase))
      } catch {
        setCuentasBancariasOptions([])
        onMessage?.({ ok: false, text: 'No se pudo cargar el catálogo de cuentas bancarias.' })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (header.modalidad === 'credito' && wizardStep > 2) {
      setWizardStep(2)
    }
  }, [header.modalidad, wizardStep])

  function resetWizard() {
    setWizardStep(0)
    setHeader(emptyCompraHeader())
    setDetalle([emptyDetalleLine()])
    setDialogAlert(null)
    setFacturaFile(null)
    setFacturaPreviewUrl('')
    setPagoInmediato(emptyPagoInmediato())
  }

  function openWizard() {
    resetWizard()
    wizardClosingFromPopRef.current = false
    pushAdminModalHistory(ADMIN_MODAL_HISTORY_MARK.compraWizard)
    setWizardOpen(true)
  }

  function closeCompraWizardUi() {
    if (wizardClosingFromPopRef.current) {
      wizardClosingFromPopRef.current = false
      return
    }
    peelAdminModalHistory(ADMIN_MODAL_HISTORY_MARK.compraWizard, ignorePopRef)
    setWizardOpen(false)
    setDialogAlert(null)
  }

  function setHeaderField(field, value) {
    if (dialogAlert) setDialogAlert(null)
    setHeader((s) => {
      const next = { ...s, [field]: value }
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

  function addDetalleLine() {
    setDetalle((prev) => [...prev, emptyDetalleLine()])
  }

  function removeDetalleLine(rowId) {
    setDetalle((prev) => {
      if (prev.length === 1) return prev
      return prev.filter((line) => line.rowId !== rowId)
    })
  }

  function validateStep(step) {
    if (step === 0) {
      if (!header.proveedor_id) return 'Selecciona un proveedor.'
      if (!header.fecha_compra) return 'Selecciona la fecha de compra.'
      if (!header.modalidad) return 'Selecciona contado o crédito.'
      if (Number(header.dias_credito) < 0 || Number.isNaN(Number(header.dias_credito))) {
        return 'Días de crédito inválido.'
      }
      if (header.modalidad === 'contado' && Number(header.dias_credito) !== 0) {
        return 'En contado los días de crédito deben ser 0.'
      }
      return ''
    }
    if (step === 1) {
      if (detalle.length < 1) return 'Debes agregar al menos una línea de detalle.'
      const invalid = detalle.find(
        (line) => !String(line.descripcion || '').trim() || Number(line.monto) <= 0 || Number.isNaN(Number(line.monto))
      )
      if (invalid) return 'Cada línea requiere descripción y monto mayor a 0.'
      return ''
    }
    if (step === 3) {
      if (!pagoInmediato.fecha_pago) return 'Indica la fecha en que pagaste al proveedor.'
      if (!pagoInmediato.forma_pago) return 'Indica la forma de pago.'
      if (formaPagoRequiereCuentaBancaria(pagoInmediato.forma_pago)) {
        if (cuentasBancariasOptions.length < 1) {
          return 'No hay cuentas bancarias activas. Crea bancos y cuentas en el catálogo.'
        }
        if (!pagoInmediato.cuenta_bancaria_id) {
          return 'Elige la cuenta bancaria del retiro (obligatoria con transferencia o tarjeta).'
        }
      }
      return ''
    }
    return ''
  }

  function nextStep() {
    const error = validateStep(wizardStep)
    if (error) {
      setDialogAlert({ severity: 'error', text: error })
      return
    }
    setDialogAlert(null)
    setWizardStep((s) => Math.min(lastStepIndex, s + 1))
  }

  function prevStep() {
    setWizardStep((s) => Math.max(0, s - 1))
  }

  function onFacturaSelected(file) {
    if (!file) return
    setFacturaFile(file)
    const preview = URL.createObjectURL(file)
    setFacturaPreviewUrl(preview)
  }

  function onCameraInputChange(event) {
    const file = event.target.files?.[0]
    onFacturaSelected(file)
    event.target.value = ''
  }

  function clearFactura() {
    setFacturaFile(null)
    setFacturaPreviewUrl('')
  }

  function onPagoComprobanteFile(file) {
    if (!file) return
    setPagoInmediato((p) => ({
      ...p,
      comprobanteFile: file,
      comprobanteUrlManual: '',
      preview: URL.createObjectURL(file),
    }))
  }

  function clearPagoComprobante() {
    setPagoInmediato((p) => ({ ...p, comprobanteFile: null, preview: '' }))
  }

  async function uploadFacturaIfNeeded() {
    if (!facturaFile) return header.foto_factura_url?.trim() || null
    const ready = await prepareFileForFacturasUpload(facturaFile)
    const ext = (ready.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const safeExt = ext || 'jpg'
    const path = `compras/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const { data, error } = await supabase.storage.from('facturas').upload(path, ready, {
      upsert: false,
      contentType: ready.type || 'image/jpeg',
    })
    if (error) throw error
    const pub = supabase.storage.from('facturas').getPublicUrl(data.path)
    return pub.data?.publicUrl || null
  }

  async function saveCompra() {
    const err0 = validateStep(0)
    const err1 = validateStep(1)
    const needPago = header.modalidad === 'contado'
    const errPago = needPago ? validateStep(3) : ''
    if (err0 || err1 || errPago) {
      setDialogAlert({ severity: 'error', text: err0 || err1 || errPago })
      return
    }
    if (wizardStep !== lastStepIndex) {
      setDialogAlert({ severity: 'error', text: 'Usa “Siguiente” hasta el último paso antes de guardar.' })
      return
    }
    setDialogAlert(null)
    setSaving(true)
    try {
      const fotoFacturaUrl = await uploadFacturaIfNeeded()
      const { data: compra, error: compraError } = await supabase
        .from('compras')
        .insert({
          proveedor_id: header.proveedor_id,
          fecha_compra: toIsoDate(header.fecha_compra),
          modalidad: header.modalidad,
          dias_credito: Number(header.dias_credito) || 0,
          comentario: String(header.comentario || '').trim() || null,
          foto_factura_url: fotoFacturaUrl,
        })
        .select('id')
        .single()
      if (compraError) throw compraError

      const detallePayload = detalle.map((line, i) => ({
        compra_id: compra.id,
        descripcion: String(line.descripcion).trim(),
        monto: Number(line.monto),
        orden: i + 1,
      }))
      const { error: detError } = await supabase.from('compras_detalle').insert(detallePayload)
      if (detError) {
        await supabase.from('compras').delete().eq('id', compra.id)
        throw detError
      }

      if (header.modalidad === 'contado') {
        const totalPago = calcTotal(detalle)
        if (totalPago <= 0) {
          throw new Error('El total a pagar debe ser mayor a 0.')
        }
        let comprobPago = null
        if (pagoInmediato.comprobanteFile) {
          comprobPago = await uploadComprobanteToFacturasBucket(
            pagoInmediato.comprobanteFile,
            'pagos_proveedor'
          )
        } else if (pagoInmediato.comprobanteUrlManual?.trim()) {
          comprobPago = pagoInmediato.comprobanteUrlManual.trim()
        }
        const pagoRow = {
          fecha_pago: toIsoDate(pagoInmediato.fecha_pago) || toIsoDate(new Date()),
          comentario: String(pagoInmediato.comentario || '').trim() || null,
          comprobante_url: comprobPago,
          forma_pago: pagoInmediato.forma_pago,
          cuenta_bancaria_id: formaPagoRequiereCuentaBancaria(pagoInmediato.forma_pago)
            ? pagoInmediato.cuenta_bancaria_id
            : null,
        }
        const { data: pago, error: errP } = await supabase
          .from('pagos_proveedor')
          .insert(pagoRow)
          .select('id')
          .single()
        if (errP) {
          if (errP.message?.includes('cuenta_bancaria') && errP.message?.includes('column')) {
            throw new Error(
              'Falta `cuenta_bancaria_id` en `pagos_proveedor`. Ejecuta `supabase/009_bancos_cuentas_movimientos.sql`.'
            )
          }
          if (errP.message?.includes('forma_pago') || errP.message?.includes('column')) {
            throw new Error(
              'Falta la columna `forma_pago` en `pagos_proveedor`. Ejecuta en Supabase `supabase/007_contado_pago_venta_y_proveedor.sql`.'
            )
          }
          throw errP
        }
        const { error: errA } = await supabase.from('pagos_proveedor_aplicacion').insert({
          pago_proveedor_id: pago.id,
          compra_id: compra.id,
          monto_aplicado: totalPago,
        })
        if (errA) {
          await supabase.from('pagos_proveedor').delete().eq('id', pago.id)
          await supabase.from('compras').delete().eq('id', compra.id)
          throw errA
        }
        if (
          formaPagoRequiereCuentaBancaria(pagoInmediato.forma_pago) &&
          pagoInmediato.cuenta_bancaria_id
        ) {
          const { error: em } = await insertMovimientoAutomaticoEgresoPago(supabase, {
            pagoProveedorId: pago.id,
            cuentaBancariaId: pagoInmediato.cuenta_bancaria_id,
            monto: totalPago,
            fechaIso: toIsoDate(pagoInmediato.fecha_pago) || toIsoDate(new Date()),
          })
          if (em) {
            await supabase.from('pagos_proveedor').delete().eq('id', pago.id)
            await supabase.from('compras').delete().eq('id', compra.id)
            if (em.message?.includes('movimientos_cuenta_bancaria') || em.message?.includes('column')) {
              throw new Error(
                'Falta la tabla o columnas de movimientos bancarios. Ejecuta `supabase/009_bancos_cuentas_movimientos.sql`.'
              )
            }
            throw em
          }
        }
      }

      onMessage?.({ ok: true, text: 'Compra registrada correctamente.' })
      peelAdminModalHistory(ADMIN_MODAL_HISTORY_MARK.compraWizard, ignorePopRef)
      setWizardOpen(false)
      resetWizard()
      refreshCompras()
    } catch (error) {
      const msg = error?.message?.includes('Bucket not found')
        ? 'No existe el bucket `facturas` en Storage. Crea ese bucket o usa URL manual.'
        : error?.message || 'No se pudo guardar la compra.'
      setDialogAlert({ severity: 'error', text: msg })
    } finally {
      setSaving(false)
    }
  }

  function askDeleteCompra(row) {
    confirmDialog({
      header: 'Eliminar compra',
      message: `Esta acción eliminará la compra de ${row.proveedor_nombre} del ${formatDate(row.fecha_compra)}.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('compras').delete().eq('id', row.id)
        if (error) {
          onMessage?.({ ok: false, text: error.message })
          return
        }
        onMessage?.({ ok: true, text: 'Compra eliminada.' })
        refreshCompras()
      },
    })
  }

  function renderStepContent() {
    if (wizardStep === 0) {
      return (
        <div className="admin-compra-step-grid">
          <div>
            <label htmlFor="compra-proveedor">Proveedor</label>
            <Dropdown
              id="compra-proveedor"
              value={header.proveedor_id}
              options={proveedoresOptions}
              onChange={(e) => setHeaderField('proveedor_id', e.value)}
              placeholder="Selecciona un proveedor"
              filter
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="compra-fecha">Fecha de compra</label>
            <Calendar
              id="compra-fecha"
              value={header.fecha_compra}
              onChange={(e) => setHeaderField('fecha_compra', e.value)}
              dateFormat="dd/mm/yy"
              showIcon
              className="w-full"
            />
          </div>
          <div className="admin-compra-field-full">
            <label>Modalidad</label>
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
              <label htmlFor="compra-credito">Días de crédito</label>
              <InputNumber
                id="compra-credito"
                value={header.dias_credito}
                onValueChange={(e) => setHeaderField('dias_credito', e.value ?? 0)}
                min={0}
                useGrouping={false}
                className="w-full"
              />
            </div>
          ) : null}
          <div className="admin-compra-field-full">
            <label htmlFor="compra-comentario">Comentario (opcional)</label>
            <InputTextarea
              id="compra-comentario"
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
        <div className="admin-compra-detalle-wrap">
          {detalle.map((line, idx) => (
            <div key={line.rowId} className="admin-compra-detalle-line">
              <div className="admin-compra-detalle-index">#{idx + 1}</div>
              <InputText
                value={line.descripcion}
                onChange={(e) => setDetalleLine(line.rowId, { descripcion: e.target.value })}
                placeholder="Descripción"
              />
              <InputNumber
                value={line.monto}
                onValueChange={(e) => setDetalleLine(line.rowId, { monto: e.value })}
                {...adminInputNumberCurrencyProps}
                min={0}
                minFractionDigits={2}
                maxFractionDigits={2}
                placeholder="Monto"
              />
              <Button
                type="button"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                aria-label="Quitar línea"
                onClick={() => removeDetalleLine(line.rowId)}
                disabled={detalle.length <= 1}
              />
            </div>
          ))}
          <div className="admin-compra-detalle-actions">
            <Button type="button" icon="pi pi-plus" label="Agregar línea" onClick={addDetalleLine} />
            <span className="admin-compra-total">Total estimado: {formatMoneyGtq(calcTotal(detalle))}</span>
          </div>
        </div>
      )
    }

    if (wizardStep === 2) {
      return (
        <div className="admin-compra-step-grid">
        <div className="admin-compra-field-full">
          <label>Foto de factura física (opcional)</label>
            <Button
              type="button"
              icon="pi pi-camera"
              label="Tomar foto"
              onClick={() => cameraInputRef.current?.click()}
            />
          <small className="admin-compra-help">
            Puedes omitir la foto y la URL. En móvil abrirá la cámara trasera; en desktop, selector de archivo.
          </small>
        </div>
        <div className="admin-compra-field-full">
          <label htmlFor="compra-foto-url">URL de factura (opcional)</label>
          <InputText
            id="compra-foto-url"
            value={header.foto_factura_url}
            onChange={(e) => setHeaderField('foto_factura_url', e.target.value)}
            placeholder="https://..."
            className="w-full"
          />
        </div>
        {facturaPreviewUrl ? (
          <div className="admin-compra-field-full">
            <img src={facturaPreviewUrl} alt="Factura seleccionada" className="admin-compra-factura-preview" />
            <div className="admin-compra-detalle-actions">
              <Button type="button" label="Quitar foto" severity="secondary" text onClick={clearFactura} />
            </div>
          </div>
        ) : null}
        </div>
      )
    }

    return (
      <div className="admin-compra-step-grid">
        <p className="admin-compra-help" style={{ marginTop: 0 }}>
          Pago inmediato al total de la factura: <strong>{formatMoneyGtq(calcTotal(detalle))}</strong>
        </p>
        <div>
          <label htmlFor="compra-pago-fecha">Fecha en que se pagó al proveedor</label>
          <Calendar
            id="compra-pago-fecha"
            value={pagoInmediato.fecha_pago}
            onChange={(e) => {
              if (dialogAlert) setDialogAlert(null)
              setPagoInmediato((p) => ({ ...p, fecha_pago: e.value }))
            }}
            dateFormat="dd/mm/yy"
            showIcon
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="compra-pago-forma">Forma de pago</label>
          <Dropdown
            id="compra-pago-forma"
            value={pagoInmediato.forma_pago}
            options={PAGO_FORMA_OPTIONS}
            onChange={(e) => {
              if (dialogAlert) setDialogAlert(null)
              const v = e.value
              setPagoInmediato((p) => ({
                ...p,
                forma_pago: v,
                cuenta_bancaria_id: formaPagoRequiereCuentaBancaria(v) ? p.cuenta_bancaria_id : null,
              }))
            }}
            className="w-full"
          />
        </div>
        {formaPagoRequiereCuentaBancaria(pagoInmediato.forma_pago) ? (
          <div className="admin-compra-field-full">
            <label htmlFor="compra-pago-cuenta">Cuenta bancaria (retiro) *</label>
            <Dropdown
              id="compra-pago-cuenta"
              value={pagoInmediato.cuenta_bancaria_id}
              options={cuentasBancariasOptions}
              onChange={(e) => {
                if (dialogAlert) setDialogAlert(null)
                setPagoInmediato((p) => ({ ...p, cuenta_bancaria_id: e.value }))
              }}
              optionLabel="label"
              optionValue="value"
              placeholder="Cuenta de la que sale el pago al proveedor"
              filter
              className="w-full"
            />
            <small className="admin-compra-help">
              Obligatoria con transferencia o tarjeta: egreso automático al registrar la compra.
            </small>
          </div>
        ) : null}
        <div className="admin-compra-field-full">
          <label htmlFor="compra-pago-coment">Comentario del pago (opcional)</label>
          <InputTextarea
            id="compra-pago-coment"
            rows={2}
            value={pagoInmediato.comentario}
            onChange={(e) => {
              if (dialogAlert) setDialogAlert(null)
              setPagoInmediato((p) => ({ ...p, comentario: e.target.value }))
            }}
            className="w-full"
          />
        </div>
        <div className="admin-compra-field-full">
          <label>Comprobante de pago (foto o archivo, opcional)</label>
          <Button
            type="button"
            icon="pi pi-camera"
            label="Tomar o elegir archivo"
            onClick={() => pagoCameraRef.current?.click()}
          />
          <small className="admin-compra-help">
            Puedes omitir archivo y URL. En móvil abre la cámara trasera; en desktop, selector de archivos.
          </small>
        </div>
        <div className="admin-compra-field-full">
          <label htmlFor="compra-pago-url">URL de comprobante (opcional)</label>
          <InputText
            id="compra-pago-url"
            value={pagoInmediato.comprobanteUrlManual}
            onChange={(e) => {
              if (dialogAlert) setDialogAlert(null)
              setPagoInmediato((p) => ({
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
        {pagoInmediato.preview ? (
          <div className="admin-compra-field-full">
            <img src={pagoInmediato.preview} alt="Comprobante de pago" className="admin-compra-factura-preview" />
            <div className="admin-compra-detalle-actions">
              <Button type="button" label="Quitar" severity="secondary" text onClick={clearPagoComprobante} />
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const filePickersPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraInputChange}
              style={{ display: 'none' }}
              aria-hidden
              tabIndex={-1}
            />
            <input
              ref={pagoCameraRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={(e) => {
                onPagoComprobanteFile(e.target.files?.[0])
                e.target.value = ''
              }}
              style={{ display: 'none' }}
              aria-hidden
              tabIndex={-1}
            />
          </>,
          document.body
        )
      : null

  return (
    <div className="admin-panel">
      {filePickersPortal}
      <ConfirmDialog />
      <h2>Compras</h2>
      <p className="lead">
        Registra compras: encabezado, detalle, paso de factura (foto o archivo o URL, ambos opcionales) y, si la
        compra es al contado, un paso extra para el pago al proveedor. Consulta el historial en el grid.
      </p>

      <div className="admin-catalog-head">
        <Button type="button" icon="pi pi-refresh" label="Actualizar" outlined severity="secondary" onClick={refreshCompras} />
        <Button type="button" icon="pi pi-plus" label="Nueva compra" onClick={openWizard} />
      </div>

      <div className="admin-catalog-card">
        <DataTable
          value={compras}
          dataKey="id"
          paginator
          rows={10}
          rowsPerPageOptions={[10, 20, 40]}
          loading={loading}
          responsiveLayout="scroll"
          emptyMessage="No hay compras registradas."
          size="small"
        >
          <Column field="fecha_compra" header="Fecha" body={(row) => formatDate(row.fecha_compra)} sortable />
          <Column field="proveedor_nombre" header="Proveedor" sortable />
          <Column
            header="Modalidad"
            body={(row) => (row.modalidad === 'credito' ? 'Crédito' : 'Contado')}
            style={{ width: '7rem' }}
          />
          <Column field="dias_credito" header="Días créd." style={{ width: '7rem' }} />
          <Column
            header="Líneas"
            body={(row) => row.compras_detalle?.length || 0}
            style={{ width: '6rem' }}
          />
          <Column
            header="Total"
            body={(row) => formatMoneyGtq(row.total)}
            sortable
            style={{ width: '8rem' }}
          />
          <Column
            header="Factura"
            body={(row) =>
              row.foto_factura_url ? (
                <a href={row.foto_factura_url} target="_blank" rel="noreferrer" className="admin-link-inline">
                  Ver imagen
                </a>
              ) : (
                '—'
              )
            }
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
                  aria-label="Ver detalle"
                  onClick={() => setViewCompra(row)}
                />
                <Button
                  type="button"
                  icon="pi pi-trash"
                  rounded
                  text
                  severity="danger"
                  aria-label="Eliminar"
                  onClick={() => askDeleteCompra(row)}
                />
              </div>
            )}
          />
        </DataTable>
      </div>

      <Dialog
        header="Nueva compra"
        visible={wizardOpen}
        style={{ width: 'min(54rem, 96vw)' }}
        onHide={closeCompraWizardUi}
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
            <Message
              severity={dialogAlert.severity}
              text={dialogAlert.text}
              className="admin-pr-message"
            />
          ) : null}
          <Steps model={stepsModel} activeIndex={wizardStep} readOnly className="admin-compra-steps" />
          <div className="admin-compra-step-content">{renderStepContent()}</div>
          <div className="admin-catalog-dialog-actions">
            <Button type="button" label="Cancelar" severity="secondary" text onClick={closeCompraWizardUi} />
            {wizardStep > 0 ? (
              <Button type="button" label="Atrás" outlined severity="secondary" onClick={prevStep} />
            ) : null}
            {wizardStep < lastStepIndex ? (
              <Button type="button" label="Siguiente" icon="pi pi-arrow-right" iconPos="right" onClick={nextStep} />
            ) : (
              <Button type="button" label="Guardar compra" icon="pi pi-check" loading={saving} onClick={saveCompra} />
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        header="Detalle de compra"
        visible={Boolean(viewCompra)}
        style={{ width: 'min(48rem, 96vw)' }}
        onHide={() => setViewCompra(null)}
        modal
      >
        {viewCompra ? (
          <div className="admin-compra-view">
            <p>
              <strong>Proveedor:</strong> {viewCompra.proveedor_nombre}
            </p>
            <p>
              <strong>Fecha:</strong> {formatDate(viewCompra.fecha_compra)} · <strong>Modalidad:</strong>{' '}
              {viewCompra.modalidad === 'credito' ? 'Crédito' : 'Contado'}
              {viewCompra.modalidad === 'credito' ? (
                <>
                  {' '}
                  · <strong>Días crédito:</strong> {viewCompra.dias_credito}
                </>
              ) : null}
            </p>
            <p>
              <strong>Registrada:</strong> {formatDateTime(viewCompra.created_at)}
            </p>
            <p>
              <strong>Comentario:</strong> {viewCompra.comentario || '—'}
            </p>
            <DataTable value={viewCompra.compras_detalle || []} dataKey="id" size="small" responsiveLayout="scroll">
              <Column field="orden" header="#" style={{ width: '4rem' }} />
              <Column field="descripcion" header="Descripción" />
              <Column
                header="Monto"
                body={(row) => formatMoneyGtq(row.monto)}
                style={{ width: '8rem' }}
              />
            </DataTable>
            <p className="admin-compra-total-inline">
              <strong>Total:</strong> {formatMoneyGtq(viewCompra.total)}
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
