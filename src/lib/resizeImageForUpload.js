/**
 * Antes de subir a Storage: limita el lado mayor (px) y comprime a JPEG.
 * PDF y no-imagen: se devuelve el archivo tal cual.
 */
const MAX_EDGE_PX = 1920
const JPEG_QUALITY = 0.82
const OUT_TYPE = 'image/jpeg'

/**
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function prepareFileForFacturasUpload(file) {
  if (!file || typeof document === 'undefined') return file
  if (!file.type.startsWith('image/')) {
    return file
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  let canvas
  try {
    const { width: sw, height: sh } = bitmap
    let w = sw
    let h = sh
    const max = MAX_EDGE_PX
    if (w > max || h > max) {
      if (w >= h) {
        h = Math.max(1, Math.round((h * max) / w))
        w = max
      } else {
        w = Math.max(1, Math.round((w * max) / h))
        h = max
      }
    }

    canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
  } catch (e) {
    console.warn('prepareFileForFacturasUpload: se sube el archivo original', e)
    return file
  } finally {
    try {
      bitmap?.close()
    } catch {
      /* ignore */
    }
  }

  try {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob vacío'))),
        OUT_TYPE,
        JPEG_QUALITY
      )
    })
    const base = file.name?.replace(/\.[^.]+$/i, '') || 'foto'
    return new File([blob], `${base}.jpg`, { type: OUT_TYPE, lastModified: Date.now() })
  } catch (e) {
    console.warn('prepareFileForFacturasUpload: se sube el archivo original', e)
    return file
  }
}
