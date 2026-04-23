import { supabase } from './supabaseClient'
import { prepareFileForFacturasUpload } from './resizeImageForUpload.js'

/**
 * Sube un archivo al bucket `facturas` (mismo que facturas de compra).
 * Las imágenes se redimensionan y comprimen a JPEG antes de subir.
 * @param {File} file
 * @param {string} subcarpeta ej. "pagos_proveedor" | "cobros_cliente"
 * @returns {Promise<string | null>} URL pública o null
 */
export async function uploadComprobanteToFacturasBucket(file, subcarpeta = 'comprobantes') {
  if (!file) return null
  const ready = await prepareFileForFacturasUpload(file)
  const ext = (ready.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeExt = ext || 'jpg'
  const path = `${subcarpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
  const { data, error } = await supabase.storage.from('facturas').upload(path, ready, {
    upsert: false,
    contentType: ready.type || 'image/jpeg',
  })
  if (error) throw error
  const pub = supabase.storage.from('facturas').getPublicUrl(data.path)
  return pub.data?.publicUrl || null
}
