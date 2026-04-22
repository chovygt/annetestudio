-- Forma de pago en cobros de clientes (después de 005_*.sql)
-- Ejecutar en Supabase SQL Editor.

DO $$ BEGIN
  CREATE TYPE public.cobro_forma_pago AS ENUM (
    'efectivo',
    'transferencia',
    'tarjeta'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.cobros_cliente
  ADD COLUMN IF NOT EXISTS forma_pago public.cobro_forma_pago NOT NULL DEFAULT 'transferencia';

COMMENT ON COLUMN public.cobros_cliente.forma_pago IS 'Cómo recibió el pago: efectivo, transferencia o tarjeta.';
