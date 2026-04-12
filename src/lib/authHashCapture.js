const STORAGE_KEY = 'anet_auth_link_error'

/**
 * Ejecutar una vez al arrancar (antes del router): el hash #error=… se pierde si
 * React Router redirige a /login antes de leerlo.
 */
export function captureAuthHashErrorOnce() {
  if (typeof window === 'undefined') return
  const h = window.location.hash
  if (!h || h.length < 2) return
  const q = h.startsWith('#') ? h.slice(1) : h
  const params = new URLSearchParams(q)
  const err = params.get('error')
  const code = params.get('error_code')
  if (!err || !code) return
  const raw = params.get('error_description') || ''
  const description = decodeURIComponent(raw.replace(/\+/g, ' '))
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code, description }))
  } catch {
    /* ignorar quota / privado */
  }
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  )
}

export function takeAuthLinkErrorFromSession() {
  if (typeof window === 'undefined') return null
  let raw
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    return JSON.parse(raw)
  } catch {
    return null
  }
}
