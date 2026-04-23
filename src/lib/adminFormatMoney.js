/**
 * Montos en quetzales (GTQ) para el panel de administración.
 * Usar en textos, tablas y junto a InputNumber (currency + locale).
 */
const LOCALE = 'es-GT'
const CURRENCY = 'GTQ'

/**
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatMoneyGtq(n) {
  const v = Number(n ?? 0)
  if (Number.isNaN(v)) {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0)
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

/** Para ejes de gráficos (sin decimales). */
export function formatMoneyGtqInteger(n) {
  const v = Math.round(Number(n ?? 0))
  if (Number.isNaN(v)) {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0)
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v)
}

/** Props recomendadas para PrimeReact InputNumber en montos en Q */
export const adminInputNumberCurrencyProps = {
  mode: 'currency',
  currency: CURRENCY,
  locale: LOCALE,
}
