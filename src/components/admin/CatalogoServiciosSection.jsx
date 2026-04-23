import { useEffect, useState } from 'react'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Tag } from 'primereact/tag'
import { supabase } from '../../lib/supabaseClient'
import { adminInputNumberCurrencyProps, formatMoneyGtq } from '../../lib/adminFormatMoney.js'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es')
}

const EMPTY_FORM = {
  codigo: '',
  descripcion: '',
  precio_desde: 0,
  activo: true,
}

export default function CatalogoServiciosSection({ onMessage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  async function refresh() {
    setLoading(true)
    const { data, error } = await supabase.from('servicios').select('*').order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudo cargar servicios: ${error.message}` })
      return
    }
    setRows(data || [])
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateField(field, value) {
    setForm((s) => ({ ...s, [field]: value }))
  }

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  function openEdit(row) {
    setEditingId(row.id)
    setForm({
      codigo: row.codigo || '',
      descripcion: row.descripcion || '',
      precio_desde: Number(row.precio_desde || 0),
      activo: Boolean(row.activo),
    })
    setOpen(true)
  }

  async function save() {
    if (!String(form.codigo || '').trim()) {
      onMessage?.({ ok: false, text: 'El código del servicio es obligatorio.' })
      return
    }
    if (!String(form.descripcion || '').trim()) {
      onMessage?.({ ok: false, text: 'La descripción del servicio es obligatoria.' })
      return
    }
    const num = Number(form.precio_desde)
    if (Number.isNaN(num) || num < 0) {
      onMessage?.({ ok: false, text: 'El precio desde debe ser mayor o igual a 0.' })
      return
    }
    const payload = {
      codigo: String(form.codigo).trim(),
      descripcion: String(form.descripcion).trim(),
      precio_desde: num,
      activo: Boolean(form.activo),
    }
    setSaving(true)
    let error = null
    if (editingId) {
      const resp = await supabase.from('servicios').update(payload).eq('id', editingId)
      error = resp.error
    } else {
      const resp = await supabase.from('servicios').insert(payload)
      error = resp.error
    }
    setSaving(false)
    if (error) {
      onMessage?.({ ok: false, text: error.message })
      return
    }
    onMessage?.({ ok: true, text: editingId ? 'Servicio actualizado.' : 'Servicio creado.' })
    setOpen(false)
    refresh()
  }

  function askDelete(row) {
    confirmDialog({
      header: 'Eliminar servicio',
      message: `Esta acción eliminará "${row.codigo} - ${row.descripcion}".`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('servicios').delete().eq('id', row.id)
        if (error) {
          onMessage?.({ ok: false, text: error.message })
          return
        }
        onMessage?.({ ok: true, text: 'Servicio eliminado.' })
        refresh()
      },
    })
  }

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Catálogo de servicios</h2>
      <p className="lead">Define código, descripción y precio base para usar en ventas.</p>

      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-plus" label="Nuevo servicio" onClick={openCreate} />
      </div>

      <div className="admin-catalog-card">
        <DataTable
          value={rows}
          dataKey="id"
          paginator
          rows={10}
          rowsPerPageOptions={[10, 20, 40]}
          loading={loading}
          responsiveLayout="scroll"
          emptyMessage="No hay servicios registrados."
          size="small"
        >
          <Column field="codigo" header="Código" sortable />
          <Column field="descripcion" header="Descripción" />
          <Column header="Precio desde" body={(row) => formatMoneyGtq(row.precio_desde)} sortable />
          <Column
            header="Estado"
            body={(row) => (
              <Tag severity={row.activo ? 'success' : 'danger'} value={row.activo ? 'Activo' : 'Inactivo'} />
            )}
          />
          <Column header="Creado" body={(row) => formatDate(row.created_at)} />
          <Column
            header=""
            style={{ width: '6rem' }}
            body={(row) => (
              <div className="admin-catalog-actions">
                <Button
                  type="button"
                  icon="pi pi-pencil"
                  rounded
                  text
                  severity="secondary"
                  aria-label="Editar"
                  onClick={() => openEdit(row)}
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
        header={editingId ? 'Editar servicio' : 'Nuevo servicio'}
        visible={open}
        style={{ width: 'min(36rem, 94vw)' }}
        onHide={() => setOpen(false)}
        modal
      >
        <div className="admin-catalog-form">
          <label htmlFor="srv-codigo">Código</label>
          <InputText id="srv-codigo" value={form.codigo} onChange={(e) => updateField('codigo', e.target.value)} />
          <label htmlFor="srv-descripcion">Descripción</label>
          <InputTextarea
            id="srv-descripcion"
            rows={3}
            value={form.descripcion}
            onChange={(e) => updateField('descripcion', e.target.value)}
          />
          <label htmlFor="srv-precio">Precio desde</label>
          <InputNumber
            id="srv-precio"
            value={form.precio_desde}
            min={0}
            minFractionDigits={2}
            maxFractionDigits={2}
            {...adminInputNumberCurrencyProps}
            onValueChange={(e) => updateField('precio_desde', e.value ?? 0)}
          />
          <label htmlFor="srv-activo" className="admin-catalog-check">
            <input
              id="srv-activo"
              type="checkbox"
              checked={Boolean(form.activo)}
              onChange={(e) => updateField('activo', e.target.checked)}
            />
            Activo
          </label>
        </div>
        <div className="admin-catalog-dialog-actions">
          <Button type="button" label="Cancelar" severity="secondary" text onClick={() => setOpen(false)} />
          <Button type="button" label={editingId ? 'Guardar cambios' : 'Crear'} loading={saving} onClick={save} />
        </div>
      </Dialog>
    </div>
  )
}
