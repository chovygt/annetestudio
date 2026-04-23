-- =============================================================================
-- AnnetEstudio — Bancos, cuentas bancarias y movimientos (depósitos / retiros)
-- Ejecutar en Supabase SQL Editor DESPUÉS de: 001 … 007 (y 008 si aplica)
-- Requiere: public.set_updated_at(), public.is_administrador()
-- =============================================================================
-- Propósito:
--   * Catálogo de bancos y de cuentas bancarias (cada cuenta pertenece a un banco).
--   * Libro de movimientos por cuenta: depósito (ingreso) y retiro (egreso).
--   * Enlazar opcionalmente pagos a proveedor (retiro), cobros/venta (ingreso) para
--     trazabilidad; la lógica “efectivo = sin ingreso automático, solo depósito manual
--     posterior” vive en la app o en un paso SQL/trigger futuro, no forzada aquí.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.movimiento_bancario_tipo AS ENUM (
    'deposito',  -- ingreso a la cuenta
    'retiro'     -- salida de la cuenta
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.movimiento_bancario_tipo IS
  'depósito = dinero entra a la cuenta; retiro = dinero sale (ej. pago a proveedor).';

-- -----------------------------------------------------------------------------
-- 1) Catálogo de bancos
-- -----------------------------------------------------------------------------
CREATE TABLE public.bancos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT, -- ej. "BAM", "GYT" (único si se informa)
  nombre      TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_bancos_codigo
  ON public.bancos (codigo) WHERE codigo IS NOT NULL AND btrim(codigo) <> '';

CREATE INDEX idx_bancos_activo_orden ON public.bancos (activo, orden, nombre);

COMMENT ON TABLE public.bancos IS 'Instituciones bancarias (catálogo maestro).';

-- -----------------------------------------------------------------------------
-- 2) Cuentas bancarias (cada fila = una cuenta operativa o subcuenta)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cuentas_bancarias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banco_id      UUID NOT NULL REFERENCES public.bancos (id) ON DELETE RESTRICT,
  nombre        TEXT NOT NULL,  -- alias interno, ej. "BAM - Operaciones Q"
  moneda        TEXT NOT NULL DEFAULT 'GTQ' CHECK (char_length(moneda) = 3),
  -- Últimos dígitos o máscara para mostrar (no reemplaza custodia segura de número completo)
  numero_mascara TEXT,
  activa        BOOLEAN NOT NULL DEFAULT true,
  comentario    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cuentas_bancarias_banco ON public.cuentas_bancarias (banco_id);
CREATE INDEX idx_cuentas_bancarias_activa ON public.cuentas_bancarias (activa);

COMMENT ON TABLE public.cuentas_bancarias IS
  'Cuentas reales o lógicas desde las que se registran retiros/depósitos.';

-- -----------------------------------------------------------------------------
-- 3) Movimientos (libro de la cuenta; saldo = sum(deposito) - sum(retiro) en app o vista)
-- -----------------------------------------------------------------------------
CREATE TABLE public.movimientos_cuenta_bancaria (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_bancaria_id UUID NOT NULL
    REFERENCES public.cuentas_bancarias (id) ON DELETE RESTRICT,
  tipo              public.movimiento_bancario_tipo NOT NULL,
  monto             NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  fecha             DATE NOT NULL DEFAULT (CURRENT_DATE),
  descripcion       TEXT,
  referencia_externa TEXT, -- número de boleta, voucher, etc.
  -- true si se genera por regla de negocio (ej. transferencia/tarjeta); false = captura manual
  es_automatico     BOOLEAN NOT NULL DEFAULT false,
  pago_proveedor_id  UUID REFERENCES public.pagos_proveedor (id) ON DELETE RESTRICT,
  cobro_cliente_id   UUID REFERENCES public.cobros_cliente (id) ON DELETE RESTRICT,
  venta_id          UUID REFERENCES public.ventas (id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcb_cuenta_fecha
  ON public.movimientos_cuenta_bancaria (cuenta_bancaria_id, fecha DESC);

COMMENT ON TABLE public.movimientos_cuenta_bancaria IS
  'Movimientos de dinero. Los FK opcionales enlazan a operaciones (un movimiento no debe duplicar el mismo enlace).';

-- Un pago a proveedor / cobro / venta no debería generar dos filas de movimiento.
CREATE UNIQUE INDEX uq_mcb_pago_proveedor
  ON public.movimientos_cuenta_bancaria (pago_proveedor_id)
  WHERE pago_proveedor_id IS NOT NULL;

CREATE UNIQUE INDEX uq_mcb_cobro_cliente
  ON public.movimientos_cuenta_bancaria (cobro_cliente_id)
  WHERE cobro_cliente_id IS NOT NULL;

CREATE UNIQUE INDEX uq_mcb_venta
  ON public.movimientos_cuenta_bancaria (venta_id)
  WHERE venta_id IS NOT NULL;

-- Coherencia: retiros ligados a pago proveedor; depósitos ligados a cobro o venta; una sola referencia "fuerte" por fila
ALTER TABLE public.movimientos_cuenta_bancaria
  ADD CONSTRAINT mcb_tipo_y_origen_check CHECK (
    (pago_proveedor_id IS NULL OR tipo = 'retiro')
    AND (cobro_cliente_id IS NULL OR tipo = 'deposito')
    AND (venta_id IS NULL OR tipo = 'deposito')
  );

ALTER TABLE public.movimientos_cuenta_bancaria
  ADD CONSTRAINT mcb_una_referencia_operacion_check CHECK (
    (CASE WHEN pago_proveedor_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN cobro_cliente_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN venta_id IS NOT NULL THEN 1 ELSE 0 END)
    <= 1
  );

-- -----------------------------------------------------------------------------
-- 4) Columnas de cabecera: desde qué cuenta operó el retiro o hacia dónde ingresó
--     (obligatoriedad según forma de pago se valida en la app o en migración futura)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pagos_proveedor
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID
    REFERENCES public.cuentas_bancarias (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_cuenta
  ON public.pagos_proveedor (cuenta_bancaria_id)
  WHERE cuenta_bancaria_id IS NOT NULL;

COMMENT ON COLUMN public.pagos_proveedor.cuenta_bancaria_id IS
  'Cuenta de la que sale el pago. Si el pago es en efectivo desde caja, puede quedar NULL hasta que se asocie un retiro/ajuste.';

ALTER TABLE public.cobros_cliente
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID
    REFERENCES public.cuentas_bancarias (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cobros_cliente_cuenta
  ON public.cobros_cliente (cuenta_bancaria_id)
  WHERE cuenta_bancaria_id IS NOT NULL;

COMMENT ON COLUMN public.cobros_cliente.cuenta_bancaria_id IS
  'Cuenta destino del cobro. Efectivo: suele dejarse NULL y reflejarse luego con un depósito manual.';

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_pago_id UUID
    REFERENCES public.cuentas_bancarias (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventas_cuenta_pago
  ON public.ventas (cuenta_bancaria_pago_id)
  WHERE cuenta_bancaria_pago_id IS NOT NULL;

COMMENT ON COLUMN public.ventas.cuenta_bancaria_pago_id IS
  'Solo aplica flujo al contado: cuenta donde se recibió el pago inmediato (transferencia/tarjeta, etc.).';

-- -----------------------------------------------------------------------------
-- 5) Triggers updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_bancos_set_updated_at ON public.bancos;
CREATE TRIGGER tr_bancos_set_updated_at
  BEFORE UPDATE ON public.bancos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_cuentas_bancarias_set_updated_at ON public.cuentas_bancarias;
CREATE TRIGGER tr_cuentas_bancarias_set_updated_at
  BEFORE UPDATE ON public.cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6) Vista: saldo por cuenta (hasta la fecha; movimientos futuros con fecha futura se incluyen)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_saldo_cuentas_bancarias AS
SELECT
  c.id AS cuenta_bancaria_id,
  c.nombre AS cuenta_nombre,
  c.moneda,
  b.id AS banco_id,
  b.nombre AS banco_nombre,
  COALESCE(SUM(
    CASE m.tipo
      WHEN 'deposito' THEN m.monto
      WHEN 'retiro'   THEN -m.monto
    END
  ), 0)::numeric(14, 2) AS saldo
FROM public.cuentas_bancarias c
INNER JOIN public.bancos b ON b.id = c.banco_id
LEFT JOIN public.movimientos_cuenta_bancaria m ON m.cuenta_bancaria_id = c.id
GROUP BY c.id, c.nombre, c.moneda, b.id, b.nombre;

COMMENT ON VIEW public.v_saldo_cuentas_bancarias IS
  'Saldo = suma(depósitos) - suma(retiros). Ajustar en la app si se requiere corte a una fecha.';

-- -----------------------------------------------------------------------------
-- 7) RLS: solo administradores
-- -----------------------------------------------------------------------------
ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_cuenta_bancaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY bancos_admin_all ON public.bancos
  FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY cuentas_bancarias_admin_all ON public.cuentas_bancarias
  FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY movimientos_cb_admin_all ON public.movimientos_cuenta_bancaria
  FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Nota: la vista usa tablas bajo RLS; solo admin con sesión.
