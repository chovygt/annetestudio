import { useCallback, useEffect, useState } from 'react'
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
import { supabase } from '../../lib/supabaseClient'
import { adminInputNumberCurrencyProps, formatMoneyGtq } from '../../lib/adminFormatMoney.js'
import { fetchCuentasBancariasOptions } from '../../lib/movimientosBancarios.js'

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EMPTY = {
  cuenta_bancaria_id: null,
  monto: null,
  fecha: new Date(),
  descripcion: '',
  referencia_externa: '',
}

/**
 * @param {object} p
 * @param {'deposito' | 'retiro'} p.tipo
 * @param {function} [p.onMessage]
 */
export default function MovimientosBancariosManualSection({ tipo, onMessage }) {
  const esIngreso = tipo === 'deposito'
  const title = esIngreso ? 'Ingresos manuales' : 'Retiros manuales'
  const lead = esIngreso
    ? 'Depósitos que registras a mano (efectivo llevado al banco, ajustes, etc.). No reemplaza cobros/ventas automáticos.'
    : 'Retiros que registras a mano (cajero, comisiones, ajustes). No reemplaza pagos a proveedores automáticos.'

  const [rows, setRows] = useState([])
  const [cuentasOpts, setCuentasOpts] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)

  const loadCuentas = useCallback(async () => {
    try {
      setCuentasOpts(await fetchCuentasBancariasOptions(supabase))
    } catch {
      setCuentasOpts([])
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('movimientos_cuenta_bancaria')
      .select('*, cuentas_bancarias ( id, nombre, bancos ( nombre ) )')
      .eq('tipo', tipo)
      .eq('es_automatico', false)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudieron cargar movimientos: ${error.message}` })
      return
    }
    setRows(data || [])
  }, [tipo, onMessage])

  useEffect(() => {
    queueMicrotask(() => {
      void loadCuentas()
      void refresh()
    })
  }, [loadCuentas, refresh])

  function openCreate() {
    if (cuentasOpts.length === 0) {
      onMessage?.({ ok: false, text: 'Crea al menos una cuenta bancaria activa en Catálogos → Bancos y cuentas.' })
      return
    }
    setEditingId(null)
    setForm(EMPTY)
    setOpen(true)
  }

  function openEdit(row) {
    setEditingId(row.id)
    setForm({
      cuenta_bancaria_id: row.cuenta_bancaria_id,
      monto: Number(row.monto),
      fecha: row.fecha ? new Date(row.fecha + 'T12:00:00') : new Date(),
      descripcion: row.descripcion || '',
      referencia_externa: row.referencia_externa || '',
    })
    setOpen(true)
  }

  async function save() {
    if (!form.cuenta_bancaria_id) {
      onMessage?.({ ok: false, text: 'Selecciona la cuenta bancaria.' })
      return
    }
    const m = Number(form.monto)
    if (Number.isNaN(m) || m <= 0) {
      onMessage?.({ ok: false, text: 'Indica un monto mayor a 0.' })
      return
    }
    const iso = toIsoDate(form.fecha)
    if (!iso) {
      onMessage?.({ ok: false, text: 'Fecha inválida.' })
      return
    }
    const payload = {
      cuenta_bancaria_id: form.cuenta_bancaria_id,
      tipo,
      monto: m,
      fecha: iso,
      descripcion: String(form.descripcion || '').trim() || null,
      referencia_externa: String(form.referencia_externa || '').trim() || null,
      es_automatico: false,
    }
    setSaving(true)
    const { error } = editingId
      ? await supabase.from('movimientos_cuenta_bancaria').update(payload).eq('id', editingId)
      : await supabase.from('movimientos_cuenta_bancaria').insert(payload)
    setSaving(false)
    if (error) {
      onMessage?.({ ok: false, text: error.message })
      return
    }
    onMessage?.({ ok: true, text: editingId ? 'Movimiento actualizado.' : 'Movimiento registrado.' })
    setOpen(false)
    refresh()
  }

  function askDelete(row) {
    confirmDialog({
      header: 'Eliminar movimiento',
      message: '¿Eliminar este registro manual? No afecta pagos o cobros del sistema.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('movimientos_cuenta_bancaria').delete().eq('id', row.id)
        if (error) {
          onMessage?.({ ok: false, text: error.message })
          return
        }
        onMessage?.({ ok: true, text: 'Movimiento eliminado.' })
        refresh()
      },
    })
  }

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>{title}</h2>
      <p className="lead">{lead}</p>

      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-refresh" label="Actualizar" outlined severity="secondary" onClick={refresh} />
        <Button
          type="button"
          icon="pi pi-plus"
          label={esIngreso ? 'Nuevo depósito' : 'Nuevo retiro'}
          onClick={openCreate}
        />
      </div>

      <div className="admin-catalog-card">
        <DataTable
          value={rows}
          dataKey="id"
          loading={loading}
          paginator
          rows={10}
          size="small"
          emptyMessage="Aún no hay movimientos manuales de este tipo."
        >
          <Column
            field="fecha"
            header="Fecha"
            sortable
            style={{ width: '8rem' }}
            body={(r) => (r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-GT') : '—')}
          />
          <Column
            header="Cuenta"
            body={(r) => {
              const c = r.cuentas_bancarias
              if (!c) return '—'
              const b = c.bancos?.nombre
              return b ? `${b} — ${c.nombre}` : c.nombre
            }}
          />
          <Column header="Monto" body={(r) => formatMoneyGtq(r.monto)} style={{ width: '9rem' }} sortable />
          <Column field="descripcion" header="Descripción" body={(r) => r.descripcion || '—'} />
          <Column field="referencia_externa" header="Ref." body={(r) => r.referencia_externa || '—'} style={{ width: '7rem' }} />
          <Column
            style={{ width: '6.5rem' }}
            body={(row) => (
              <div className="admin-catalog-actions">
                <Button type="button" icon="pi pi-pencil" rounded text severity="secondary" onClick={() => openEdit(row)} />
                <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => askDelete(row)} />
              </div>
            )}
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? (esIngreso ? 'Editar depósito' : 'Editar retiro') : esIngreso ? 'Nuevo depósito' : 'Nuevo retiro'}
        visible={open}
        style={{ width: 'min(34rem, 94vw)' }}
        onHide={() => setOpen(false)}
        modal
      >
        <div className="admin-catalog-form">
          <label htmlFor="m-cuenta">Cuenta bancaria *</label>
          <Dropdown
            id="m-cuenta"
            value={form.cuenta_bancaria_id}
            options={cuentasOpts}
            onChange={(e) => setForm((s) => ({ ...s, cuenta_bancaria_id: e.value }))}
            optionLabel="label"
            optionValue="value"
            filter
            placeholder="Selecciona cuenta"
            className="w-full"
          />
          <label htmlFor="m-monto">Monto (Q) *</label>
          <InputNumber
            id="m-monto"
            value={form.monto}
            onValueChange={(e) => setForm((s) => ({ ...s, monto: e.value ?? null }))}
            {...adminInputNumberCurrencyProps}
            min={0.01}
            className="w-full"
          />
          <label htmlFor="m-fecha">Fecha *</label>
          <Calendar
            id="m-fecha"
            value={form.fecha}
            onChange={(e) => setForm((s) => ({ ...s, fecha: e.value ?? new Date() }))}
            dateFormat="dd/mm/yy"
            showIcon
            className="w-full"
          />
          <label htmlFor="m-desc">Descripción (opcional)</label>
          <InputTextarea
            id="m-desc"
            rows={2}
            value={form.descripcion}
            onChange={(e) => setForm((s) => ({ ...s, descripcion: e.target.value }))}
          />
          <label htmlFor="m-ref">Referencia / boleta (opcional)</label>
          <InputText
            id="m-ref"
            value={form.referencia_externa}
            onChange={(e) => setForm((s) => ({ ...s, referencia_externa: e.target.value }))}
          />
        </div>
        <div className="admin-catalog-dialog-actions">
          <Button type="button" label="Cancelar" severity="secondary" text onClick={() => setOpen(false)} />
          <Button type="button" label="Guardar" icon="pi pi-check" loading={saving} onClick={save} />
        </div>
      </Dialog>
    </div>
  )
}
