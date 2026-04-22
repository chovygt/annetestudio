/** Últimos N meses (desde hace N-1 hasta el actual) con acumulador de monto. */
export function lastNMonthMoneyBuckets(n = 12) {
  const out = []
  const now = new Date()
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es', { month: 'short', year: '2-digit' })
    out.push({ key, label, amount: 0 })
  }
  return out
}

/**
 * Suma `getAmount(row)` al bucket cuyo `key` coincide con el mes de `getDateKey(row)`.
 * `getDateKey` devuelve un Date o string ISO; se toma YYYY-MM.
 */
export function sumMoneyIntoMonthBuckets(buckets, rows, getDateKey, getAmount) {
  const map = new Map(buckets.map((b) => [b.key, b]))
  for (const row of rows) {
    const raw = getDateKey(row)
    if (raw == null) continue
    const d = raw instanceof Date ? raw : new Date(raw)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const b = map.get(key)
    if (b) b.amount += Number(getAmount(row)) || 0
  }
}
