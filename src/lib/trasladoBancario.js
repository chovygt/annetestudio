/**
 * Crea un traslado: un retiro en la cuenta origen y un depósito en la destino (mismo monto, mismo traslado_grupo_id).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ cuentaOrigenId: string, cuentaDestinoId: string, monto: number, fechaIso: string, nota?: string }} p
 * @returns {Promise<{ error: Error | null, trasladoGrupoId?: string }>}
 */
export async function ejecutarTrasladoEntreCuentas(client, p) {
  const monto = Number(p.monto)
  if (Number.isNaN(monto) || monto <= 0) {
    return { error: new Error('Monto inválido.') }
  }
  if (p.cuentaOrigenId === p.cuentaDestinoId) {
    return { error: new Error('La cuenta de origen y la de destino deben ser distintas.') }
  }

  const { data: origen, error: e1 } = await client
    .from('cuentas_bancarias')
    .select('id, nombre, moneda, bancos ( nombre )')
    .eq('id', p.cuentaOrigenId)
    .maybeSingle()
  if (e1) return { error: e1 }
  if (!origen) return { error: new Error('Cuenta de origen no encontrada.') }

  const { data: dest, error: e2 } = await client
    .from('cuentas_bancarias')
    .select('id, nombre, moneda, bancos ( nombre )')
    .eq('id', p.cuentaDestinoId)
    .maybeSingle()
  if (e2) return { error: e2 }
  if (!dest) return { error: new Error('Cuenta de destino no encontrada.') }

  if (String(origen.moneda || 'GTQ') !== String(dest.moneda || 'GTQ')) {
    return { error: new Error('Las dos cuentas deben usar la misma moneda para un traslado.') }
  }

  const trasladoGrupoId = crypto.randomUUID()
  const origenLabel = [origen.bancos?.nombre, origen.nombre].filter(Boolean).join(' — ')
  const destLabel = [dest.bancos?.nombre, dest.nombre].filter(Boolean).join(' — ')
  const suf = p.nota?.trim() ? ` · ${p.nota.trim()}` : ''

  const { data: rowRet, error: er } = await client
    .from('movimientos_cuenta_bancaria')
    .insert({
      cuenta_bancaria_id: p.cuentaOrigenId,
      tipo: 'retiro',
      monto,
      fecha: p.fechaIso,
      descripcion: `Traslado a: ${destLabel}${suf}`,
      es_automatico: false,
      traslado_grupo_id: trasladoGrupoId,
    })
    .select('id')
    .single()

  if (er) {
    if (er.message?.includes('traslado_grupo_id') && er.message?.includes('column')) {
      return {
        error: new Error(
          'Falta la columna `traslado_grupo_id` en movimientos. Ejecuta `supabase/010_traslado_grupo_movimientos.sql`.'
        ),
      }
    }
    return { error: er }
  }

  const { error: ed } = await client.from('movimientos_cuenta_bancaria').insert({
    cuenta_bancaria_id: p.cuentaDestinoId,
    tipo: 'deposito',
    monto,
    fecha: p.fechaIso,
    descripcion: `Traslado desde: ${origenLabel}${suf}`,
    es_automatico: false,
    traslado_grupo_id: trasladoGrupoId,
  })

  if (ed) {
    await client.from('movimientos_cuenta_bancaria').delete().eq('id', rowRet.id)
    return { error: ed }
  }

  return { error: null, trasladoGrupoId }
}
