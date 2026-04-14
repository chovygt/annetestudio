import { useState } from 'react'
import QRCodeLib from 'qrcode'
import AdminDialog from './AdminDialog.jsx'
import { supabase } from '../../lib/supabaseClient'
import { QR_TOKEN_DISPLAY_OPTIONS } from '../../lib/qrTokenDisplayOptions.js'

export default function TokenQrDialog({ open, onClose, userId, onCreated }) {
  const [cantidad, setCantidad] = useState('1')
  const [token, setToken] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrErr, setQrErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function reset() {
    setCantidad('1')
    setToken('')
    setQrDataUrl('')
    setQrErr('')
    setErr('')
    setBusy(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function generar(e) {
    e.preventDefault()
    setErr('')
    setQrErr('')
    const n = parseInt(cantidad, 10)
    if (Number.isNaN(n) || n < 1) {
      setErr('Indica un número válido de sellos (mínimo 1).')
      return
    }
    setBusy(true)
    const t = crypto.randomUUID()
    const { error } = await supabase.from('qr_tokens').insert({
      token: t,
      cantidad_sellos: n,
      creado_por: userId,
    })
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }

    let dataUrl = ''
    try {
      dataUrl = await QRCodeLib.toDataURL(t, QR_TOKEN_DISPLAY_OPTIONS)
    } catch (qrE) {
      setQrErr(qrE?.message || 'No se pudo generar la imagen del QR')
    }

    setToken(t)
    setQrDataUrl(dataUrl)
    setBusy(false)
    onCreated?.()
  }

  return (
    <AdminDialog open={open} title="Generar código y QR" onClose={handleClose}>
      {!token ? (
        <form className="admin-dialog-form" onSubmit={generar}>
          <p className="admin-dialog-lead">
            El QR contendrá el mismo código que la clienta puede pegar en la app para canjear sellos.
          </p>
          <label htmlFor="dlg-token-qty">Número de sellos que otorga este código</label>
          <input
            id="dlg-token-qty"
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="admin-input"
          />
          {err ? <p className="admin-dialog-err">{err}</p> : null}
          <div className="admin-dialog-actions">
            <button type="button" className="admin-btn ghost" onClick={handleClose}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? 'Generando…' : 'Generar'}
            </button>
          </div>
        </form>
      ) : (
        <div className="admin-qr-result">
          <p className="admin-dialog-lead">
            Muestra este QR en el salón o comparte el código con la clienta.
          </p>
          <div className="admin-qr-wrap">
            {qrErr ? (
              <p className="admin-dialog-err">{qrErr}</p>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} width={220} height={220} alt="Código QR del token" />
            ) : (
              <p className="admin-dialog-meta">Sin imagen QR; el token abajo sigue siendo válido.</p>
            )}
          </div>
          <label className="admin-qr-label">Token</label>
          <textarea className="admin-qr-token" readOnly rows={3} value={token} />
          <div className="admin-dialog-actions">
            <button
              type="button"
              className="admin-btn ghost"
              onClick={() => {
                navigator.clipboard?.writeText(token)
              }}
            >
              Copiar token
            </button>
            <button
              type="button"
              className="admin-btn primary"
              onClick={() => {
                reset()
              }}
            >
              Generar otro
            </button>
            <button type="button" className="admin-btn ghost" onClick={handleClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </AdminDialog>
  )
}
