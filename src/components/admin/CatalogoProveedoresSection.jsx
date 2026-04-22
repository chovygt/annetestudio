import { useEffect, useState } from 'react'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Tag } from 'primereact/tag'
import { supabase } from '../../lib/supabaseClient'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es')
}

const EMPTY_FORM = {
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
  notas: '',
  activo: true,
}

export default function CatalogoProveedoresSection({ onMessage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  async function refresh() {
    setLoading(true)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudo cargar proveedores: ${error.message}` })
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
      nombre: row.nombre || '',
      contacto: row.contacto || '',
      telefono: row.telefono || '',
      email: row.email || '',
      notas: row.notas || '',
      activo: Boolean(row.activo),
    })
    setOpen(true)
  }

  async function save() {
    if (!String(form.nombre || '').trim()) {
      onMessage?.({ ok: false, text: 'El nombre del proveedor es obligatorio.' })
      return
    }
    const payload = {
      nombre: String(form.nombre).trim(),
      contacto: String(form.contacto || '').trim() || null,
      telefono: String(form.telefono || '').trim() || null,
      email: String(form.email || '').trim() || null,
      notas: String(form.notas || '').trim() || null,
      activo: Boolean(form.activo),
    }
    setSaving(true)
    let error = null
    if (editingId) {
      const resp = await supabase.from('proveedores').update(payload).eq('id', editingId)
      error = resp.error
    } else {
      const resp = await supabase.from('proveedores').insert(payload)
      error = resp.error
    }
    setSaving(false)
    if (error) {
      onMessage?.({ ok: false, text: error.message })
      return
    }
    onMessage?.({ ok: true, text: editingId ? 'Proveedor actualizado.' : 'Proveedor creado.' })
    setOpen(false)
    refresh()
  }

  function askDelete(row) {
    confirmDialog({
      header: 'Eliminar proveedor',
      message: `Esta acción eliminará "${row.nombre || 'proveedor'}".`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('proveedores').delete().eq('id', row.id)
        if (error) {
          onMessage?.({ ok: false, text: error.message })
          return
        }
        onMessage?.({ ok: true, text: 'Proveedor eliminado.' })
        refresh()
      },
    })
  }

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Catálogo de proveedores</h2>
      <p className="lead">Gestiona proveedores para asociarlos en compras.</p>

      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-plus" label="Nuevo proveedor" onClick={openCreate} />
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
          emptyMessage="No hay proveedores registrados."
          size="small"
        >
          <Column field="nombre" header="Nombre" sortable />
          <Column field="contacto" header="Contacto" />
          <Column field="telefono" header="Teléfono" />
          <Column field="email" header="Email" />
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
        header={editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
        visible={open}
        style={{ width: 'min(36rem, 94vw)' }}
        onHide={() => setOpen(false)}
        modal
      >
        <div className="admin-catalog-form">
          <label htmlFor="prov-nombre">Nombre</label>
          <InputText id="prov-nombre" value={form.nombre} onChange={(e) => updateField('nombre', e.target.value)} />
          <label htmlFor="prov-contacto">Contacto</label>
          <InputText
            id="prov-contacto"
            value={form.contacto}
            onChange={(e) => updateField('contacto', e.target.value)}
          />
          <label htmlFor="prov-telefono">Teléfono</label>
          <InputText
            id="prov-telefono"
            value={form.telefono}
            onChange={(e) => updateField('telefono', e.target.value)}
          />
          <label htmlFor="prov-email">Email</label>
          <InputText id="prov-email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          <label htmlFor="prov-notas">Notas</label>
          <InputTextarea id="prov-notas" rows={3} value={form.notas} onChange={(e) => updateField('notas', e.target.value)} />
          <label htmlFor="prov-activo" className="admin-catalog-check">
            <input
              id="prov-activo"
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
