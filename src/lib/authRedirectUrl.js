/**
 * Origen público de la app (sin barra final).
 * En producción en Vercel conviene fijar `VITE_SITE_URL=https://tu-dominio.vercel.app`
 * en Variables de entorno del build, para que los enlaces del correo apunten siempre ahí
 * aunque alguien se registre desde un preview u otro host.
 *
 * Además, en Supabase → Authentication → URL configuration:
 * - Site URL: tu URL de producción (Vercel).
 * - Redirect URLs: incluye esa URL y rutas usadas (p. ej. …/login).
 */
export function getSiteOrigin() {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** Destino del enlace de confirmación de correo (debe coincidir con Redirect URLs en Supabase). */
export function getEmailConfirmationRedirectUrl() {
  const base = getSiteOrigin()
  if (!base) return undefined
  return `${base}/login`
}
