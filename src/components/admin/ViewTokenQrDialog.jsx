import AdminDialog from './AdminDialog.jsx'

export default function ViewTokenQrDialog({ open, onClose, token, dataUrl, qrErr, cantidadSellos }) {
  return (
    <AdminDialog open={open} title="Código QR del token" onClose={onClose}>
      <div className="admin-qr-result">
        <p className="admin-dialog-lead">
          Mismo código que la clienta puede pegar en la app para canjear sellos.
          {cantidadSellos != null ? (
            <>
              {' '}
              <span className="admin-dialog-meta">
                Este código otorga <strong>{cantidadSellos}</strong> sello{cantidadSellos === 1 ? '' : 's'}.
              </span>
            </>
          ) : null}
        </p>
        <div className="admin-qr-wrap">
          {qrErr ? (
            <p className="admin-dialog-err">{qrErr}</p>
          ) : dataUrl ? (
            <img src={dataUrl} width={220} height={220} alt="Código QR del token" />
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
          <button type="button" className="admin-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </AdminDialog>
  )
}
