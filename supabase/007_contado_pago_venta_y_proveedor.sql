-- Pago inmediato en compras/ventas al contado (después de 005; el enum reutiliza 006 o se crea aquí)
-- Requiere: cobro_forma_pago (006) o el bloque DO de abajo.

DO $$ BEGIN
  CREATE TYPE public.cobro_forma_pago AS ENUM (
    'efectivo',
    'transferencia',
    'tarjeta'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Pago a proveedor: forma (para el paso "pago" al comprar al contado)
ALTER TABLE public.pagos_proveedor
  ADD COLUMN IF NOT EXISTS forma_pago public.cobro_forma_pago;

COMMENT ON COLUMN public.pagos_proveedor.forma_pago IS 'Cómo se pagó (efectivo, transferencia, tarjeta). Útil al registrar pago junto a compra al contado.';

-- Venta al contado: no usar tabla cobros_cliente (exclusiva a crédito). Se guarda aquí el cobro inmediato.
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS forma_pago public.cobro_forma_pago;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS pago_comprobante_url TEXT;

COMMENT ON COLUMN public.ventas.forma_pago IS 'Rellena solo si modalidad=contado: forma en que la clienta pagó.';
COMMENT ON COLUMN public.ventas.pago_comprobante_url IS 'Comprobante del pago inmediato (venta al contado).';
