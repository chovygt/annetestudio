import { useAuth } from '../contexts/AuthContext'

function friendlyMessage(code, description) {
  if (code === 'otp_expired') {
    return (
      <>
        <strong>El enlace de confirmación ya no sirve.</strong> Suele pasar si el
        enlace caducó, si ya lo usaste antes, o si el correo (Hotmail/Outlook
        &quot;Enlaces seguros&quot;) lo abrió automáticamente y lo gastó al
        primer intento.
        <br />
        <br />
        Prueba: pide un <strong>nuevo correo de confirmación</strong>, o abre el
        enlace en una ventana privada. En desarrollo puedes desactivar
        &quot;Confirm email&quot; en Supabase o confirmar el usuario manualmente
        en el panel.
      </>
    )
  }
  return description || code || 'Error al confirmar el enlace.'
}

export default function AuthCallbackAlert() {
  const { authLinkError, clearAuthLinkError } = useAuth()
  if (!authLinkError) return null

  return (
    <div className="error" role="alert">
      <p style={{ margin: 0 }}>{friendlyMessage(authLinkError.code, authLinkError.description)}</p>
      <button type="button" className="dismiss-auth-alert" onClick={clearAuthLinkError}>
        Cerrar aviso
      </button>
    </div>
  )
}
