/**
 * Mensajes más claros para errores frecuentes de Supabase Auth.
 */
export function mapAuthErrorMessage(message) {
  if (!message || typeof message !== 'string') return message
  const m = message.toLowerCase()

  if (m.includes('rate limit') && m.includes('email')) {
    return (
      'Límite de correos de Supabase alcanzado (plan gratuito). ' +
      'Espera unos minutos u horas e inténtalo de nuevo, o crea el usuario desde el panel de Supabase. ' +
      'También puedes desactivar temporalmente “Confirm email” en Authentication → Providers → Email.'
    )
  }

  return message
}
