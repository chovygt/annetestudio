import { useCallback, useEffect, useState } from 'react'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Password } from 'primereact/password'
import { Tag } from 'primereact/tag'
import { supabase } from '../../lib/supabaseClient'

const MIN_PASSWORD = 6

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es')
}

function parseInvokeFailure(data, error, fnName) {
  if (data && typeof data === 'object' && data.error) {
    return String(data.error)
  }
  if (!error) return null
  const status = error.context?.status
  const msg = error.message || 'Error desconocido'
  let suggestion = `La Edge Function «${fnName}» no está desplegada o falló la petición. Ejecuta: npm run deploy:functions:admin-clientas`

  if (status === 401 || status === 403) {
    suggestion =
      'La función rechazó la sesión. Cierra sesión y entra de nuevo como administradora, o revisa el proyecto de Supabase.'
  } else if (/failed to fetch|networkerror|failed to send/i.test(msg)) {
    suggestion =
      'Fallo de red al llamar a Edge Functions. Revisa la consola del navegador y VITE_SUPABASE_URL.'
  }

  return `${suggestion} Detalle técnico: HTTP ${status ?? '—'} · ${msg}`
}

export default function AdminConfirmarCorreosSection({ onMessage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [pwdDlg, setPwdDlg] = useState(null)
  const [pwdNew, setPwdNew] = useState('')
  const [pwdAgain, setPwdAgain] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_clientas_auth_status')
    setLoading(false)
    if (error) {
      onMessage?.({
        ok: false,
        text: `No se pudo cargar la lista: ${error.message}`,
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

    if (data && typeof data === 'object' && data.error) {
      onMessage?.({ ok: false, text: String(data.error) })
      return
    }

    if (!error) {
      onMessage?.({ ok: true, text: 'Correo confirmado correctamente.' })
      await refresh()
      return
    }

    onMessage?.({
      ok: false,
      text: parseInvokeFailure(data, error, 'admin-confirm-email'),
    })
  }

  function openPasswordDialog(row) {
    setPwdDlg(row)
    setPwdNew('')
    setPwdAgain('')
  }

  function closePasswordDialog() {
    if (pwdBusy) return
    setPwdDlg(null)
    setPwdNew('')
    setPwdAgain('')
  }

  async function savePassword() {
    if (!pwdDlg) return
    const a = pwdNew
    const b = pwdAgain
    if (a.length < MIN_PASSWORD) {
      onMessage?.({ ok: false, text: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` })
      return
    }
    if (a !== b) {
      onMessage?.({ ok: false, text: 'Las contraseñas no coinciden.' })
      return
    }
    setPwdBusy(true)
    onMessage?.(null)
    const { data, error } = await supabase.functions.invoke('admin-set-clienta-password', {
      body: { targetUserId: pwdDlg.id, newPassword: a },
    })
    setPwdBusy(false)

    if (data && typeof data === 'object' && data.error) {
      onMessage?.({ ok: false, text: String(data.error) })
      return
    }
    if (!error) {
      onMessage?.({
        ok: true,
        text: 'Contraseña actualizada. Comunícale a la clienta la nueva contraseña por un canal seguro.',
      })
      closePasswordDialog()
      return
    }
    onMessage?.({
      ok: false,
      text: parseInvokeFailure(data, error, 'admin-set-clienta-password'),
    })
  }

  const estadoBody = (row) =>
    row.email_confirmed_at ? (
      <Tag severity="success" value="Confirmado" />
    ) : (
      <Tag severity="warn" value="Pendiente" />
    )

  const accionesBody = (row) => (
    <div className="admin-row-actions" style={{ flexWrap: 'wrap' }}>
      <Button
        type="button"
        label={row.email_confirmed_at ? 'Volver a confirmar' : 'Confirmar correo'}
        icon="pi pi-check"
        size="small"
        outlined={Boolean(row.email_confirmed_at)}
        loading={busyId === row.id}
        disabled={(busyId !== null && busyId !== row.id) || pwdBusy}
        onClick={() => requestConfirm(row)}
      />
      <Button
        type="button"
        label="Cambiar contraseña"
        icon="pi pi-key"
        size="small"
        outlined
        severity="secondary"
        loading={pwdBusy && pwdDlg?.id === row.id}
        disabled={busyId !== null || pwdBusy}
        onClick={() => openPasswordDialog(row)}
      />
    </div>
  )

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Confirmar correos de clientas</h2>
      <p className="lead">
        Listado de cuentas registradas como <strong>clienta</strong>. Puedes verificar el correo o
        asignar una nueva contraseña desde aquí.
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
        <Column
          field="email_confirmed_at"
          header="Confirmado el"
          body={(r) => formatDate(r.email_confirmed_at)}
          sortable
        />
        <Column field="created_at" header="Alta cuenta" body={(r) => formatDate(r.created_at)} sortable />
        <Column header="Acciones" body={accionesBody} style={{ minWidth: '17rem' }} />
      </DataTable>

      <Dialog
        header="Nueva contraseña"
        visible={pwdDlg !== null}
        style={{ width: 'min(26rem, 94vw)' }}
        onHide={closePasswordDialog}
        footer={
          <div className="admin-row-actions">
            <Button type="button" label="Cancelar" severity="secondary" text onClick={closePasswordDialog} disabled={pwdBusy} />
            <Button type="button" label="Guardar" icon="pi pi-check" loading={pwdBusy} onClick={() => void savePassword()} />
          </div>
        }
      >
        {pwdDlg ? (
          <div className="admin-dialog-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="lead" style={{ margin: 0 }}>
              Clienta: <strong>{pwdDlg.nombre || pwdDlg.email}</strong>
            </p>
            <div>
              <label htmlFor="pwd-new" style={{ display: 'block', marginBottom: '0.35rem' }}>
                Nueva contraseña
              </label>
              <Password
                id="pwd-new"
                inputClassName="w-full"
                style={{ width: '100%' }}
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                toggleMask
                feedback={false}
                disabled={pwdBusy}
                promptLabel=""
                weakLabel=""
                mediumLabel=""
                strongLabel=""
              />
            </div>
            <div>
              <label htmlFor="pwd-again" style={{ display: 'block', marginBottom: '0.35rem' }}>
                Repetir contraseña
              </label>
              <Password
                id="pwd-again"
                inputClassName="w-full"
                style={{ width: '100%' }}
                value={pwdAgain}
                onChange={(e) => setPwdAgain(e.target.value)}
                toggleMask
                feedback={false}
                disabled={pwdBusy}
                promptLabel=""
                weakLabel=""
                mediumLabel=""
                strongLabel=""
              />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
