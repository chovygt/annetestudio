import { useCallback, useEffect, useState } from 'react'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { DataTable } from 'primereact/datatable'
import { Tag } from 'primereact/tag'
import { supabase } from '../../lib/supabaseClient'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es')
}

export default function AdminConfirmarCorreosSection({ onMessage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_clientas_auth_status')
    setLoading(false)
    if (error) {
      onMessage?.({
        ok: false,
        text: `No se pudo cargar la lista: ${error.message}. Si aparece que la función no existe, ejecuta en Supabase el script supabase/011_admin_clientas_auth_list.sql.`,
      })
      setRows([])
      return
    }
    setRows(data || [])
  }, [onMessage])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const filtered = filter.trim()
    ? rows.filter((r) => {
        const q = filter.trim().toLowerCase()
        const n = (r.nombre || '').toLowerCase()
        const e = (r.email || '').toLowerCase()
        return n.includes(q) || e.includes(q)
      })
    : rows

  function requestConfirm(row) {
    confirmDialog({
      header: 'Confirmar correo',
      message: `¿Marcar como confirmado el correo de ${row.nombre || row.email || 'esta clienta'}? Podrá iniciar sesión sin abrir el enlace del email.`,
      icon: 'pi pi-envelope',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-primary',
      accept: () => void runConfirm(row.id),
    })
  }

  async function runConfirm(targetUserId) {
    setBusyId(targetUserId)
    onMessage?.(null)
    const { data, error } = await supabase.functions.invoke('admin-confirm-email', {
      body: { targetUserId },
    })
    setBusyId(null)
    if (error) {
      onMessage?.({
        ok: false,
        text:
          error.message?.includes('Failed to send') || error.context?.status === 404
            ? 'Despliega la Edge Function admin-confirm-email (supabase functions deploy) o revisa el nombre de la función.'
            : error.message || 'No se pudo confirmar el correo.',
      })
      return
    }
    if (data?.error) {
      onMessage?.({ ok: false, text: data.error })
      return
    }
    onMessage?.({ ok: true, text: 'Correo confirmado correctamente.' })
    await refresh()
  }

  const estadoBody = (row) =>
    row.email_confirmed_at ? (
      <Tag severity="success" value="Confirmado" />
    ) : (
      <Tag severity="warn" value="Pendiente" />
    )

  const accionesBody = (row) => (
    <Button
      type="button"
      label={row.email_confirmed_at ? 'Volver a confirmar' : 'Confirmar correo'}
      icon="pi pi-check"
      size="small"
      outlined={Boolean(row.email_confirmed_at)}
      loading={busyId === row.id}
      disabled={busyId !== null && busyId !== row.id}
      onClick={() => requestConfirm(row)}
    />
  )

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Confirmar correos de clientas</h2>
      <p className="lead">
        Listado de cuentas registradas como <strong>clienta</strong>. Si Supabase exige confirmación
        por email, aquí puedes marcar el correo como verificado sin que la clienta abra el enlace.
      </p>
      <p className="lead" style={{ fontSize: '0.95rem' }}>
        Requisitos: SQL{' '}
        <code style={{ fontSize: '0.85rem' }}>supabase/011_admin_clientas_auth_list.sql</code> y Edge
        Function <code style={{ fontSize: '0.85rem' }}>admin-confirm-email</code> desplegada (la
        service role solo en el servidor).
      </p>
      <div className="admin-toolbar" style={{ marginBottom: '1rem' }}>
        <input
          type="search"
          className="admin-input"
          style={{ flex: '1 1 12rem', maxWidth: '22rem' }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por nombre o correo…"
        />
        <Button
          type="button"
          label="Actualizar"
          icon="pi pi-refresh"
          outlined
          severity="secondary"
          onClick={() => refresh()}
          disabled={loading}
        />
      </div>
      <DataTable
        value={filtered}
        loading={loading}
        emptyMessage="No hay clientas o aún no se pudo cargar."
        paginator
        rows={15}
        rowsPerPageOptions={[15, 30, 50]}
        dataKey="id"
      >
        <Column field="nombre" header="Nombre" sortable />
        <Column field="email" header="Correo" sortable />
        <Column header="Correo verificado" body={estadoBody} />
        <Column field="email_confirmed_at" header="Confirmado el" body={(r) => formatDate(r.email_confirmed_at)} sortable />
        <Column field="created_at" header="Alta cuenta" body={(r) => formatDate(r.created_at)} sortable />
        <Column header="Acciones" body={accionesBody} style={{ minWidth: '12rem' }} />
      </DataTable>
    </div>
  )
}
