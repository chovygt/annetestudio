/**
 * Genera un PNG con QR para compartir con clientas.
 * Uso: node scripts/generate-qr-clientas.mjs "https://tu-dominio.com/login"
 */
import QRCode from 'qrcode'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const out = join(root, 'public', 'images', 'qr-clientas-anneth.png')

const url = process.argv[2]?.trim()
if (!url) {
  console.error('Uso: node scripts/generate-qr-clientas.mjs "https://tu-app.com/login"')
  process.exit(1)
}
if (!/^https?:\/\//i.test(url)) {
  console.error('La URL debe empezar por http:// o https://')
  process.exit(1)
}

await mkdir(dirname(out), { recursive: true })
await QRCode.toFile(out, url, {
  width: 520,
  margin: 2,
  errorCorrectionLevel: 'M',
  color: { dark: '#3d291c', light: '#fffaf5' },
})
console.log('QR guardado en:', out)
console.log('Destino:', url)
