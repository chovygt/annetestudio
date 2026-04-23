/**
 * Bancos: transferencia/tarjeta requieren cuenta para movimientos automáticos; efectivo no.
 * @param {string|null|undefined} formaPago
 * @returns {boolean}
 */
export function formaPagoRequiereCuentaBancaria(formaPago) {
  return formaPago === 'transferencia' || formaPago === 'tarjeta'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ value: string, label: string }[]>}
 */
export async function fetchCuentasBancariasOptions(supabase) {
  const { data, error } = await supabase
    .from('cuentas_bancarias')
    .select('id, nombre, numero_mascara, bancos ( nombre )')
    .eq('activa', true)
    .order('nombre', { ascending: true })
  if (error) throw error
  return (data || []).map((c) => {
    const b = c.bancos?.nombre
    const mask = c.numero_mascara ? `· …${c.numero_mascara}` : null
    const label = [b, c.nombre, mask].filter(Boolean).join(' — ')
    return { value: c.id, label }
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ pagoProveedorId: string, cuentaBancariaId: string, monto: number, fechaIso: string }} p
 * @returns {Promise<{ error: Error | null }>}
 */
export async function insertMovimientoAutomaticoEgresoPago(supabase, p) {
  const { error } = await supabase.from('movimientos_cuenta_bancaria').insert({
    cuenta_bancaria_id: p.cuentaBancariaId,
    tipo: 'retiro',
    monto: Number(p.monto),
    fecha: p.fechaIso,
    descripcion: 'Egreso automático: pago a proveedor',
    es_automatico: true,
    pago_proveedor_id: p.pagoProveedorId,
  })
  return { error: error || null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ cobroClienteId: string, cuentaBancariaId: string, monto: number, fechaIso: string }} p
 * @returns {Promise<{ error: Error | null }>}
 */
export async function insertMovimientoAutomaticoIngresoCobro(supabase, p) {
  const { error } = await supabase.from('movimientos_cuenta_bancaria').insert({
    cuenta_bancaria_id: p.cuentaBancariaId,
    tipo: 'deposito',
    monto: Number(p.monto),
    fecha: p.fechaIso,
    descripcion: 'Ingreso automático: cobro a clienta',
    es_automatico: true,
    cobro_cliente_id: p.cobroClienteId,
  })
  return { error: error || null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventaId: string, cuentaBancariaId: string, monto: number, fechaIso: string }} p
 * @returns {Promise<{ error: Error | null }>}
 */
export async function insertMovimientoAutomaticoIngresoVentaContado(supabase, p) {
  const { error } = await supabase.from('movimientos_cuenta_bancaria').insert({
    cuenta_bancaria_id: p.cuentaBancariaId,
    tipo: 'deposito',
    monto: Number(p.monto),
    fecha: p.fechaIso,
    descripcion: 'Ingreso automático: venta al contado',
    es_automatico: true,
    venta_id: p.ventaId,
  })
  return { error: error || null }
}

/**
 * @param {unknown} row
 * @param {string} [key]
 * @returns {string}
 */
export function labelCuentaBancariaDesdePagoRow(row) {
  const c = row?.cuentas_bancarias
  if (!c) return '—'
  const b = c.bancos?.nombre
  const base = c.nombre
  if (b && base) return `${b} — ${base}`
  return base || '—'
}
