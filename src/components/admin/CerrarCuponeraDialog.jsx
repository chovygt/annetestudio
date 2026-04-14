import { useMemo, useState } from 'react'
import AdminDialog from './AdminDialog.jsx'
import { supabase } from '../../lib/supabaseClient'

export default function CerrarCuponeraDialog({
  open,
  onClose,
  clientaIdInicial,
  clientas,
  onDone,
}) {
  const [clientaId, setClientaId] = useState(() => clientaIdInicial || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const elegida = useMemo(
    () => clientas.find((c) => c.id === clientaId),
    [clientas, clientaId]
  )

  async function confirmar(e) {
    e.preventDefault()
    setErr('')
    setOk('')
    if (!clientaId) {
      setErr('Selecciona una clienta.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_cerrar_cuponera', {
      p_clienta_id: clientaId,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data?.ok === false) {
      const m = {
        no_admin: 'No autorizado.',
        clienta_no_encontrada: 'Clienta no encontrada.',
        sin_configuracion: 'Falta configuración de sellos por cuponera.',
      }
      setErr(m[data.error] || data.error || 'Error')
      return
    }
    setOk('Cuponera cerrada y nueva cuponera creada.')
    onDone?.()
  }

  function handleClose() {
    setErr('')
    setOk('')
    onClose()
  }

  return (
    <AdminDialog open={open} title="Canjear / cerrar cuponera" onClose={handleClose}>
      <form className="admin-dialog-form" onSubmit={confirmar}>
        <p className="admin-dialog-lead">
          Marca la cuponera <strong>activa</strong> de la clienta como completada (aunque no
          tenga todos los sellos) y abre una <strong>nueva cuponera</strong> con la meta
          actual del programa.
        </p>
        <label htmlFor="dlg-cerrar-clienta">Clienta</label>
        <select
          id="dlg-cerrar-clienta"
          className="admin-input"
          value={clientaId}
          onChange={(e) => setClientaId(e.target.value)}
          required
        >
          <option value="">— Elige —</option>
          {clientas.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.nombre || c.email || c.id).slice(0, 48)}
              {c.email ? ` · ${c.email}` : ''}
            </option>
          ))}
        </select>
        {elegida ? (
          <p className="admin-dialog-meta">
            Se aplicará sobre la cuenta de <strong>{elegida.nombre || elegida.email}</strong>.
          </p>
        ) : null}
        {err ? <p className="admin-dialog-err">{err}</p> : null}
        {ok ? <p className="admin-dialog-ok">{ok}</p> : null}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn ghost" onClick={handleClose}>
            {ok ? 'Cerrar' : 'Cancelar'}
          </button>
          {!ok ? (
            <button type="submit" className="admin-btn primary warn" disabled={busy}>
              {busy ? 'Procesando…' : 'Confirmar cierre'}
            </button>
          ) : null}
        </div>
      </form>
    </AdminDialog>
  )
}
