import { supabase } from './supabaseClient'

/**
 * Sube un archivo al bucket `facturas` (mismo que facturas de compra).
 * @param {File} file
 * @param {string} subcarpeta ej. "pagos_proveedor" | "cobros_cliente"
 * @returns {Promise<string | null>} URL pública o null
 */
export async function uploadComprobanteToFacturasBucket(file, subcarpeta = 'comprobantes') {
  if (!file) return null
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeExt = ext || 'jpg'
  const path = `${subcarpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
  const { data, error } = await supabase.storage.from('facturas').upload(path, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  const pub = supabase.storage.from('facturas').getPublicUrl(data.path)
  return pub.data?.publicUrl || null
}
