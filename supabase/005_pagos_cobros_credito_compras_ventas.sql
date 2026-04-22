-- =============================================================================
-- AnnetEstudio — Pagos a proveedores, cobros de clientes, compras/ventas contado o crédito
-- Ejecutar en Supabase SQL Editor (después de 003_*.sql y existencia de 001: set_updated_at, is_administrador)
-- =============================================================================
-- Resumen:
--   Compras: `modalidad` = contado | crédito. Si contado, `dias_credito` debe ser 0.
--   Ventas:  `modalidad` = contado | crédito. Contado = sin saldo; crédito usa `dias_credito` y vencimiento.
--   `pagos_proveedor` = un movimiento de pago a proveedores (fecha, comentario, comprobante/foto).
--   `pagos_proveedor_aplicacion` = N filas: cuánto de ese pago se aplica a cada factura (compra); parcial o total.
--   `cobros_cliente` = un movimiento de cobro de clienta.
--   `cobros_cliente_aplicacion` = N filas: cuánto se aplica a cada venta (factura) a crédito; parcial o total.
-- Comprobantes: guardar URL (Storage bucket recomendado: `comprobantes_pagos` o similar, público/privado según RLS de Storage).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Modalidad contado / crédito (reutilizable)
DO $$ BEGIN
  CREATE TYPE public.modalidad_pago AS ENUM ('contado', 'credito');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Alter compras: modalidad; si contado, sin días de crédito
-- -----------------------------------------------------------------------------
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS modalidad public.modalidad_pago NOT NULL DEFAULT 'credito';

COMMENT ON COLUMN public.compras.modalidad IS 'Contado: sin financiamiento. Crédito: usa dias_credito y vencimiento = fecha_compra + dias.';

-- Regla: contado implica 0 días; crédito puede tener días > 0
ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_modalidad_dias_check;

ALTER TABLE public.compras
  ADD CONSTRAINT compras_modalidad_dias_check CHECK (
    (modalidad = 'contado' AND dias_credito = 0)
    OR
    (modalidad = 'credito' AND dias_credito >= 0)
  );

-- -----------------------------------------------------------------------------
-- 2) Alter ventas: modalidad, días de crédito, validación con clienta
-- -----------------------------------------------------------------------------
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS modalidad public.modalidad_pago NOT NULL DEFAULT 'contado';

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS dias_credito INTEGER NOT NULL DEFAULT 0 CHECK (dias_credito >= 0);

COMMENT ON COLUMN public.ventas.modalidad IS 'Contado: total pagado al momento de la venta (sin cobros pendientes). Crédito: aplicar cobros en cobros_cliente_aplicacion.';
COMMENT ON COLUMN public.ventas.dias_credito IS 'Solo aplica a modalidad=crédito. Vencimiento sugerido: fecha_venta + dias_credito.';

ALTER TABLE public.ventas
  DROP CONSTRAINT IF EXISTS ventas_modalidad_dias_check;

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_modalidad_dias_check CHECK (
    (modalidad = 'contado' AND dias_credito = 0)
    OR
    (modalidad = 'credito' AND dias_credito >= 0)
  );

-- -----------------------------------------------------------------------------
-- 3) Totales (helpers para checks)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compra_monto_total(p_compra_id uuid)
RETURNS NUMERIC(14, 2)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(d.monto), 0)
  FROM public.compras_detalle d
  WHERE d.compra_id = p_compra_id;
$$;

CREATE OR REPLACE FUNCTION public.venta_monto_total(p_venta_id uuid)
RETURNS NUMERIC(14, 2)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM((d.cantidad::numeric) * d.precio_unitario), 0)
  FROM public.ventas_detalle d
  WHERE d.venta_id = p_venta_id;
$$;

-- -----------------------------------------------------------------------------
-- 4) Pago a proveedores (cabecera) + aplicaciones a facturas (compras)
-- -----------------------------------------------------------------------------
CREATE TABLE public.pagos_proveedor (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_pago     DATE NOT NULL DEFAULT (CURRENT_DATE),
  comentario     TEXT,
  comprobante_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagos_proveedor_fecha ON public.pagos_proveedor (fecha_pago DESC);

COMMENT ON TABLE public.pagos_proveedor IS 'Un movimiento de pago (efectivo/transferencia) con comprobante; se reparte en una o varias compras.';

CREATE TABLE public.pagos_proveedor_aplicacion (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_proveedor_id UUID NOT NULL REFERENCES public.pagos_proveedor (id) ON DELETE CASCADE,
  compra_id         UUID NOT NULL REFERENCES public.compras (id) ON DELETE RESTRICT,
  monto_aplicado    NUMERIC(12, 2) NOT NULL CHECK (monto_aplicado > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pago_proveedor_compra
  ON public.pagos_proveedor_aplicacion (pago_proveedor_id, compra_id);

CREATE INDEX idx_ppa_compra ON public.pagos_proveedor_aplicacion (compra_id);

COMMENT ON TABLE public.pagos_proveedor_aplicacion IS 'Monto de este pago aplicado a una factura de compra (parcial o total; varias facturas por un mismo pago).';

-- Sum pagos por compra
CREATE OR REPLACE FUNCTION public.compra_monto_pagado(p_compra_id uuid)
RETURNS NUMERIC(14, 2)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
  FROM public.pagos_proveedor_aplicacion a
  WHERE a.compra_id = p_compra_id;
$$;

CREATE OR REPLACE FUNCTION public.pagos_proveedor_aplicacion_validar_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total  numeric(14, 2);
  v_otros  numeric(14, 2);
  v_nuevo  numeric(14, 2);
BEGIN
  v_total := public.compra_monto_total(NEW.compra_id);
  SELECT COALESCE(SUM(a.monto_aplicado), 0) INTO v_otros
  FROM public.pagos_proveedor_aplicacion a
  WHERE a.compra_id = NEW.compra_id
    AND a.id IS DISTINCT FROM NEW.id;
  v_nuevo := v_otros + NEW.monto_aplicado;
  IF v_nuevo - v_total > 0.0001 THEN
    RAISE EXCEPTION 'monto acumulado a la compra (%) supera el total (%)', v_nuevo, v_total;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_ppa_validar_iu
  BEFORE INSERT OR UPDATE ON public.pagos_proveedor_aplicacion
  FOR EACH ROW
  EXECUTE FUNCTION public.pagos_proveedor_aplicacion_validar_upsert();

-- -----------------------------------------------------------------------------
-- 5) Cobro de clienta (cabecera) + aplicaciones a facturas (ventas a crédito)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cobros_cliente (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_cobro     DATE NOT NULL DEFAULT (CURRENT_DATE),
  comentario      TEXT,
  comprobante_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cobros_cliente_fecha ON public.cobros_cliente (fecha_cobro DESC);

CREATE TABLE public.cobros_cliente_aplicacion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobro_cliente_id   UUID NOT NULL REFERENCES public.cobros_cliente (id) ON DELETE CASCADE,
  venta_id           UUID NOT NULL REFERENCES public.ventas (id) ON DELETE RESTRICT,
  monto_aplicado     NUMERIC(12, 2) NOT NULL CHECK (monto_aplicado > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_cobro_venta
  ON public.cobros_cliente_aplicacion (cobro_cliente_id, venta_id);

CREATE INDEX idx_cca_venta ON public.cobros_cliente_aplicacion (venta_id);

COMMENT ON TABLE public.cobros_cliente IS 'Cobro (efectivo/transferencia) con comprobante; se aplica a una o varias ventas a crédito.';

-- Solo ventas a crédito deben recibir cobros
CREATE OR REPLACE FUNCTION public.cobros_cliente_aplicacion_solo_venta_credito()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m public.modalidad_pago;
BEGIN
  SELECT v.modalidad INTO m FROM public.ventas v WHERE v.id = NEW.venta_id;
  IF m IS NULL THEN
    RAISE EXCEPTION 'venta no encontrada';
  END IF;
  IF m = 'contado' THEN
    RAISE EXCEPTION 'no se aplica cobro a una venta al contado (ya está saldada por definición)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_cca_solo_credito
  BEFORE INSERT OR UPDATE ON public.cobros_cliente_aplicacion
  FOR EACH ROW
  EXECUTE FUNCTION public.cobros_cliente_aplicacion_solo_venta_credito();

CREATE OR REPLACE FUNCTION public.venta_monto_cobrado(p_venta_id uuid)
RETURNS NUMERIC(14, 2)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
  FROM public.cobros_cliente_aplicacion a
  WHERE a.venta_id = p_venta_id;
$$;

CREATE OR REPLACE FUNCTION public.cobros_cliente_aplicacion_validar_monto()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total numeric(14, 2);
  v_otros numeric(14, 2);
  v_nuevo numeric(14, 2);
BEGIN
  v_total := public.venta_monto_total(NEW.venta_id);
  SELECT COALESCE(SUM(a.monto_aplicado), 0) INTO v_otros
  FROM public.cobros_cliente_aplicacion a
  WHERE a.venta_id = NEW.venta_id
    AND a.id IS DISTINCT FROM NEW.id;
  v_nuevo := v_otros + NEW.monto_aplicado;
  IF v_nuevo - v_total > 0.0001 THEN
    RAISE EXCEPTION 'monto cobrado (%) excede total de la venta (%)', v_nuevo, v_total;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_cca_monto
  BEFORE INSERT OR UPDATE ON public.cobros_cliente_aplicacion
  FOR EACH ROW
  EXECUTE FUNCTION public.cobros_cliente_aplicacion_validar_monto();

-- Triggers updated_at
CREATE TRIGGER tr_pagos_proveedor_updated
  BEFORE UPDATE ON public.pagos_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_cobros_cliente_updated
  BEFORE UPDATE ON public.cobros_cliente
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6) RLS: solo admin (igual que el resto del módulo operativo)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pagos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_proveedor_aplicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobros_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobros_cliente_aplicacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pagos_proveedor_admin_all"
  ON public.pagos_proveedor FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY "pagos_proveedor_aplicacion_admin_all"
  ON public.pagos_proveedor_aplicacion FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY "cobros_cliente_admin_all"
  ON public.cobros_cliente FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY "cobros_cliente_aplicacion_admin_all"
  ON public.cobros_cliente_aplicacion FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Permiso de uso de funciones helper (lectura)
GRANT EXECUTE ON FUNCTION public.compra_monto_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compra_monto_pagado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venta_monto_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venta_monto_cobrado(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7) Vistas útiles (saldos)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_compras_saldo AS
SELECT
  c.id AS compra_id,
  c.proveedor_id,
  c.fecha_compra,
  c.modalidad,
  c.dias_credito,
  public.compra_monto_total(c.id) AS monto_total,
  public.compra_monto_pagado(c.id) AS monto_pagado,
  public.compra_monto_total(c.id) - public.compra_monto_pagado(c.id) AS saldo_pendiente
FROM public.compras c;

CREATE OR REPLACE VIEW public.v_ventas_saldo AS
SELECT
  v.id AS venta_id,
  v.origen_clienta,
  v.clienta_perfil_id,
  v.clienta_manual_id,
  v.fecha_venta,
  v.modalidad,
  v.dias_credito,
  public.venta_monto_total(v.id) AS monto_total,
  CASE
    WHEN v.modalidad = 'contado' THEN public.venta_monto_total(v.id)
    ELSE public.venta_monto_cobrado(v.id)
  END AS monto_cobrado,
  CASE
    WHEN v.modalidad = 'contado' THEN 0::numeric(14, 2)
    ELSE (public.venta_monto_total(v.id) - public.venta_monto_cobrado(v.id))
  END AS saldo_pendiente
FROM public.ventas v;

COMMENT ON VIEW public.v_ventas_saldo IS 'Contado: saldo 0. Crédito: total menos cobros aplicados.';

-- Nota: las vistas anteriores requieren permiso SELECT: por defecto en Supabase, vistas heredan de tablas; asegurar que clientas no tengan acceso a estas tablas (solo admin vía RLS en tablas base).
