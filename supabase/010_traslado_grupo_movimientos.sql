-- Traslado entre cuentas: agrupa el par retiro + depósito (después de 009_bancos_cuentas_movimientos.sql)
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.movimientos_cuenta_bancaria
  ADD COLUMN IF NOT EXISTS traslado_grupo_id UUID;

CREATE INDEX IF NOT EXISTS idx_mcb_traslado_grupo
  ON public.movimientos_cuenta_bancaria (traslado_grupo_id)
  WHERE traslado_grupo_id IS NOT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_bancaria.traslado_grupo_id IS
  'Mismo UUID en el retiro (cuenta origen) y el depósito (cuenta destino) de un traslado.';

GRANT SELECT ON public.v_saldo_cuentas_bancarias TO authenticated;
