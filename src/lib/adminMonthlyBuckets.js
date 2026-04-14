/** Últimos 12 meses calendario (desde hace 11 meses hasta el mes actual). */
export function last12MonthBuckets() {
  const out = []
  const now = new Date()
  for (let offset = 11; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es', { month: 'short', year: '2-digit' })
    out.push({ key, label, count: 0 })
  }
  return out
}

/** Suma conteos por mes (campo fecha ISO). */
export function countIntoBuckets(buckets, rows, field) {
  const map = new Map(buckets.map((b) => [b.key, b]))
  for (const row of rows) {
    const v = row[field]
    if (v == null) continue
    const key =
      typeof v === 'string' ? v.slice(0, 7) : new Date(v).toISOString().slice(0, 7)
    const b = map.get(key)
    if (b) b.count += 1
  }
}
