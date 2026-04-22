-- =============================================================================
-- AnnetEstudio — catálogos operativos, compras y ventas (Supabase / PostgreSQL)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- (Después de 001_schema_anet_estudio.sql)
-- =============================================================================
-- Incluye:
--   - proveedores
--   - compras (encabezado + detalle: descripción + monto; sin catálogo de productos)
--   - clientas_manuales (clientas que no están en public.profiles)
--   - servicios (código, descripción, precio_desde)
--   - ventas (encabezado + detalle: servicio, precio unitario modificable)
-- La clienta de una venta es O bien un perfil registrado (role clienta) O una fila
-- de clientas_manuales, indicado en origen_clienta.
-- La foto de factura de compra se referencia por URL (p. ej. Supabase Storage).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
CREATE TYPE public.venta_origen_clienta AS ENUM ('perfil', 'manual');

-- -----------------------------------------------------------------------------
-- 1) Catálogo de proveedores
-- -----------------------------------------------------------------------------
CREATE TABLE public.proveedores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  notas       TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proveedores_activo_nombre ON public.proveedores (activo, nombre);

COMMENT ON TABLE public.proveedores IS 'Proveedores del salón.';

-- -----------------------------------------------------------------------------
-- 2) Compras: encabezado y detalle
-- -----------------------------------------------------------------------------
CREATE TABLE public.compras (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id       UUID NOT NULL REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  fecha_compra       DATE NOT NULL DEFAULT (CURRENT_DATE),
  dias_credito       INTEGER NOT NULL DEFAULT 0 CHECK (dias_credito >= 0),
  comentario         TEXT,
  foto_factura_url   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compras_fecha ON public.compras (fecha_compra DESC);
CREATE INDEX idx_compras_proveedor ON public.compras (proveedor_id);

COMMENT ON TABLE public.compras IS 'Compra: encabezado; la foto es URL (Storage u otro).';
COMMENT ON COLUMN public.compras.foto_factura_url IS 'URL pública o path de la factura escaneada.';

CREATE TABLE public.compras_detalle (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id    UUID NOT NULL REFERENCES public.compras (id) ON DELETE CASCADE,
  descripcion  TEXT NOT NULL,
  monto        NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  orden        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_compras_detalle_compra ON public.compras_detalle (compra_id, orden);

COMMENT ON TABLE public.compras_detalle IS 'Línea de compra: solo descripción y monto.';

-- -----------------------------------------------------------------------------
-- 3) Catálogo de clientas manuales (no registradas en auth / profiles)
-- -----------------------------------------------------------------------------
CREATE TABLE public.clientas_manuales (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  email       TEXT,
  telefono    TEXT,
  notas       TEXT,
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientas_manuales_activa_nombre ON public.clientas_manuales (activa, nombre);

COMMENT ON TABLE public.clientas_manuales IS 'Clientas sin cuenta; ventas las enlazan vía origen_clienta = manual.';

-- -----------------------------------------------------------------------------
-- 4) Catálogo de servicios
-- -----------------------------------------------------------------------------
CREATE TABLE public.servicios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT NOT NULL UNIQUE,
  descripcion   TEXT NOT NULL,
  precio_desde  NUMERIC(12, 2) NOT NULL CHECK (precio_desde >= 0),
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_servicios_activo ON public.servicios (activo);

COMMENT ON TABLE public.servicios IS 'Listado de servicios; precio_desde es referencia, la venta guarda el precio aplicado.';

-- -----------------------------------------------------------------------------
-- 5) Ventas: encabezado (clienta: perfil O manual) y detalle (servicio + precio)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ventas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_clienta     public.venta_origen_clienta NOT NULL,
  clienta_perfil_id  UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  clienta_manual_id  UUID REFERENCES public.clientas_manuales (id) ON DELETE RESTRICT,
  fecha_venta        DATE NOT NULL DEFAULT (CURRENT_DATE),
  comentario         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ventas_clienta_consistente CHECK (
    (origen_clienta = 'perfil' AND clienta_perfil_id IS NOT NULL AND clienta_manual_id IS NULL)
    OR
    (origen_clienta = 'manual' AND clienta_manual_id IS NOT NULL AND clienta_perfil_id IS NULL)
  )
);

CREATE INDEX idx_ventas_fecha ON public.ventas (fecha_venta DESC);
CREATE INDEX idx_ventas_perfil ON public.ventas (clienta_perfil_id) WHERE clienta_perfil_id IS NOT NULL;
CREATE INDEX idx_ventas_manual ON public.ventas (clienta_manual_id) WHERE clienta_manual_id IS NOT NULL;

COMMENT ON TABLE public.ventas IS 'Venta: clienta = perfil (registrada) o clientas_manuales.';

CREATE TABLE public.ventas_detalle (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id         UUID NOT NULL REFERENCES public.ventas (id) ON DELETE CASCADE,
  servicio_id      UUID NOT NULL REFERENCES public.servicios (id) ON DELETE RESTRICT,
  cantidad         INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario  NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
  orden            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_ventas_detalle_venta ON public.ventas_detalle (venta_id, orden);

COMMENT ON TABLE public.ventas_detalle IS 'Línea de venta: precio_unitario es el que aplica (puede diferir de servicios.precio_desde).';

-- Validar que, si la venta es a perfil, el perfil tenga role = clienta
CREATE OR REPLACE FUNCTION public.ventas_validar_perfil_clienta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.origen_clienta = 'perfil' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = NEW.clienta_perfil_id AND p.role = 'clienta'
    ) THEN
      RAISE EXCEPTION 'ventas: clienta_perfil_id debe ser un profile con role clienta';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_ventas_validar_perfil_clienta
  BEFORE INSERT OR UPDATE ON public.ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.ventas_validar_perfil_clienta();

-- -----------------------------------------------------------------------------
-- Triggers updated_at
-- -----------------------------------------------------------------------------
CREATE TRIGGER tr_proveedores_updated
  BEFORE UPDATE ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_compras_updated
  BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_clientas_manuales_updated
  BEFORE UPDATE ON public.clientas_manuales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_servicios_updated
  BEFORE UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_ventas_updated
  BEFORE UPDATE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: solo administradores (las clientas no leen ni escriben aquí; se puede abrir
--      a clientas en el futuro con políticas adicionales).
-- -----------------------------------------------------------------------------
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientas_manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_detalle ENABLE ROW LEVEL SECURITY;

-- Proveedores
CREATE POLICY "proveedores_admin_all"
  ON public.proveedores FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Compras y detalle
CREATE POLICY "compras_admin_all"
  ON public.compras FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY "compras_detalle_admin_all"
  ON public.compras_detalle FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Clientas manuales
CREATE POLICY "clientas_manuales_admin_all"
  ON public.clientas_manuales FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Servicios (solo admin: lectura y escritura)
CREATE POLICY "servicios_admin_all"
  ON public.servicios FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Ventas y detalle
CREATE POLICY "ventas_admin_all"
  ON public.ventas FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY "ventas_detalle_admin_all"
  ON public.ventas_detalle FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- Nota: is_administrador() y set_updated_at() deben existir (ver 001_schema_anet_estudio.sql).
