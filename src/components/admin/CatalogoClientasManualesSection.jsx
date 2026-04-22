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
  email: '',
  telefono: '',
  notas: '',
  activa: true,
}

export default function CatalogoClientasManualesSection({ onMessage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  async function refresh() {
    setLoading(true)
    const { data, error } = await supabase
      .from('clientas_manuales')
      .select('*')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudo cargar clientas manuales: ${error.message}` })
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
      email: row.email || '',
      telefono: row.telefono || '',
      notas: row.notas || '',
      activa: Boolean(row.activa),
    })
    setOpen(true)
  }

  async function save() {
    if (!String(form.nombre || '').trim()) {
      onMessage?.({ ok: false, text: 'El nombre de la clienta manual es obligatorio.' })
      return
    }
    const payload = {
      nombre: String(form.nombre).trim(),
      email: String(form.email || '').trim() || null,
      telefono: String(form.telefono || '').trim() || null,
      notas: String(form.notas || '').trim() || null,
      activa: Boolean(form.activa),
    }
    setSaving(true)
    let error = null
    if (editingId) {
      const resp = await supabase.from('clientas_manuales').update(payload).eq('id', editingId)
      error = resp.error
    } else {
      const resp = await supabase.from('clientas_manuales').insert(payload)
      error = resp.error
    }
    setSaving(false)
    if (error) {
      onMessage?.({ ok: false, text: error.message })
      return
    }
    onMessage?.({ ok: true, text: editingId ? 'Clienta manual actualizada.' : 'Clienta manual creada.' })
    setOpen(false)
    refresh()
  }

  function askDelete(row) {
    confirmDialog({
      header: 'Eliminar clienta manual',
      message: `Esta acción eliminará "${row.nombre || 'clienta manual'}".`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('clientas_manuales').delete().eq('id', row.id)
        if (error) {
          onMessage?.({ ok: false, text: error.message })
          return
        }
        onMessage?.({ ok: true, text: 'Clienta manual eliminada.' })
        refresh()
      },
    })
  }

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Catálogo de clientas manuales</h2>
      <p className="lead">Clientas sin cuenta registrada en `profiles`.</p>

      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-plus" label="Nueva clienta manual" onClick={openCreate} />
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
          emptyMessage="No hay clientas manuales registradas."
          size="small"
        >
          <Column field="nombre" header="Nombre" sortable />
          <Column field="telefono" header="Teléfono" />
          <Column field="email" header="Email" />
          <Column
            header="Estado"
            body={(row) => (
              <Tag severity={row.activa ? 'success' : 'danger'} value={row.activa ? 'Activa' : 'Inactiva'} />
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
        header={editingId ? 'Editar clienta manual' : 'Nueva clienta manual'}
        visible={open}
        style={{ width: 'min(36rem, 94vw)' }}
        onHide={() => setOpen(false)}
        modal
      >
        <div className="admin-catalog-form">
          <label htmlFor="cli-nombre">Nombre</label>
          <InputText id="cli-nombre" value={form.nombre} onChange={(e) => updateField('nombre', e.target.value)} />
          <label htmlFor="cli-telefono">Teléfono</label>
          <InputText id="cli-telefono" value={form.telefono} onChange={(e) => updateField('telefono', e.target.value)} />
          <label htmlFor="cli-email">Email</label>
          <InputText id="cli-email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          <label htmlFor="cli-notas">Notas</label>
          <InputTextarea id="cli-notas" rows={3} value={form.notas} onChange={(e) => updateField('notas', e.target.value)} />
          <label htmlFor="cli-activa" className="admin-catalog-check">
            <input
              id="cli-activa"
              type="checkbox"
              checked={Boolean(form.activa)}
              onChange={(e) => updateField('activa', e.target.checked)}
            />
            Activa
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
