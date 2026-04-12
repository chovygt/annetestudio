-- =============================================================================
-- AnnetEstudio — esquema inicial (Supabase / PostgreSQL)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================
-- Incluye: perfiles (clienta / administrador), cuponeras, sellos por QR con token,
--          configuración del programa y tramos de descuento.
-- =============================================================================

-- Extensión para UUID aleatorios (en Supabase suele estar ya habilitada)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('clienta', 'administrador');

CREATE TYPE public.cuponera_status AS ENUM ('activa', 'completada');

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT,
  nombre     TEXT,
  role       public.user_role NOT NULL DEFAULT 'clienta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles (role);

COMMENT ON TABLE public.profiles IS 'Datos públicos del usuario; role define clienta vs administrador.';

-- -----------------------------------------------------------------------------
-- Configuración global del programa de fidelidad (una fila recomendada)
-- -----------------------------------------------------------------------------
CREATE TABLE public.program_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name       TEXT NOT NULL DEFAULT 'AnnetEstudio',
  sellos_por_cuponera INTEGER NOT NULL DEFAULT 10
    CHECK (sellos_por_cuponera > 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.program_settings IS 'Meta de sellos por cuponera; el admin puede cambiarla (nuevas cuponeras usan el valor vigente).';

-- Fila inicial
INSERT INTO public.program_settings (salon_name, sellos_por_cuponera)
VALUES ('AnnetEstudio', 10);

-- -----------------------------------------------------------------------------
-- Tramos de recompensa: "con X sellos en la cuponera actual tienes Y% descuento"
-- El admin configura filas; la app calcula el mejor tramo alcanzado según sellos actuales.
-- -----------------------------------------------------------------------------
CREATE TABLE public.reward_tiers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellos_requeridos INTEGER NOT NULL CHECK (sellos_requeridos > 0),
  descuento_porcentaje NUMERIC(5, 2) NOT NULL
    CHECK (descuento_porcentaje >= 0 AND descuento_porcentaje <= 100),
  descripcion       TEXT,
  orden             INTEGER NOT NULL DEFAULT 0,
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reward_tiers_activo_orden ON public.reward_tiers (activo, orden, sellos_requeridos);

COMMENT ON TABLE public.reward_tiers IS 'Ej.: 5 sellos → 20%, 10 sellos → 50%. Orden ayuda a mostrar de menor a mayor.';

-- Ejemplos (puedes borrarlos o editarlos desde el admin)
INSERT INTO public.reward_tiers (sellos_requeridos, descuento_porcentaje, descripcion, orden)
VALUES
  (5, 20, '20% de descuento al acumular 5 sellos', 1),
  (10, 50, '50% de descuento al acumular 10 sellos', 2);

-- -----------------------------------------------------------------------------
-- Cuponeras: cada "tarjeta" (activa o ya completada) por clienta
-- -----------------------------------------------------------------------------
CREATE TABLE public.cuponeras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clienta_id      UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  numero_secuencia INTEGER NOT NULL CHECK (numero_secuencia >= 1),
  meta_sellos     INTEGER NOT NULL CHECK (meta_sellos > 0),
  sellos_actuales INTEGER NOT NULL DEFAULT 0 CHECK (sellos_actuales >= 0),
  estado          public.cuponera_status NOT NULL DEFAULT 'activa',
  iniciada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completada_en   TIMESTAMPTZ,
  UNIQUE (clienta_id, numero_secuencia)
);

CREATE INDEX idx_cuponeras_clienta ON public.cuponeras (clienta_id);
CREATE INDEX idx_cuponeras_clienta_activa ON public.cuponeras (clienta_id) WHERE estado = 'activa';

COMMENT ON TABLE public.cuponeras IS 'Historial de tarjetas: al llegar a meta_sellos pasa a completada y se abre otra (nueva secuencia).';

-- -----------------------------------------------------------------------------
-- Tokens QR: lo que el administrador genera; el QR lleva el token (ej. UUID)
-- Un solo canje por token salvo que uses max_canjes > 1 (promos grupales).
-- -----------------------------------------------------------------------------
CREATE TABLE public.qr_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NOT NULL UNIQUE,
  cantidad_sellos INTEGER NOT NULL CHECK (cantidad_sellos > 0),
  creado_por      UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  expira_en       TIMESTAMPTZ,
  max_canjes      INTEGER NOT NULL DEFAULT 1 CHECK (max_canjes > 0),
  canjes_realizados INTEGER NOT NULL DEFAULT 0 CHECK (canjes_realizados >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qr_tokens_canjes_ok CHECK (canjes_realizados <= max_canjes)
);

CREATE INDEX idx_qr_tokens_token ON public.qr_tokens (token);

COMMENT ON TABLE public.qr_tokens IS 'Seguridad: solo quien escanea con sesión válida canjea; el token es opaco y de un solo uso (típico).';

-- -----------------------------------------------------------------------------
-- Registro de cada canje / movimiento de sellos (auditoría)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sello_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clienta_id   UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  cuponera_id  UUID REFERENCES public.cuponeras (id) ON DELETE SET NULL,
  qr_token_id  UUID REFERENCES public.qr_tokens (id) ON DELETE SET NULL,
  sellos       INTEGER NOT NULL CHECK (sellos <> 0),
  tipo         TEXT NOT NULL DEFAULT 'canje_qr'
    CHECK (tipo IN ('canje_qr', 'ajuste_admin', 'completar_cuponera')),
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sello_events_clienta ON public.sello_events (clienta_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Trigger: updated_at en profiles y program_settings
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_program_settings_updated
  BEFORE UPDATE ON public.program_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Al registrarse un usuario en Auth, crear fila en profiles
-- Por defecto 'clienta'; el primer admin lo subes manualmente o vía SQL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre', split_part(NEW.email, '@', 1)),
    'clienta'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Función: canjear token (llamar desde la app con usuario autenticado)
-- Reparte sellos entre cuponeras si una se completa a mitad del lote.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_qr_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.qr_tokens%ROWTYPE;
  v_settings RECORD;
  v_remaining INTEGER;
  v_cuponera public.cuponeras%ROWTYPE;
  v_next_seq INTEGER;
  v_room INTEGER;
  v_apply INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autenticado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'clienta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'solo_clientas');
  END IF;

  SELECT * INTO v_row
  FROM public.qr_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  IF v_row.expira_en IS NOT NULL AND v_row.expira_en < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_expirado');
  END IF;

  IF v_row.canjes_realizados >= v_row.max_canjes THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_agotado');
  END IF;

  SELECT sellos_por_cuponera INTO v_settings FROM public.program_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND OR v_settings.sellos_por_cuponera IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_configuracion');
  END IF;

  v_remaining := v_row.cantidad_sellos;

  LOOP
    EXIT WHEN v_remaining <= 0;

    SELECT * INTO v_cuponera
    FROM public.cuponeras
    WHERE clienta_id = v_uid AND estado = 'activa'
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT COALESCE(MAX(numero_secuencia), 0) + 1 INTO v_next_seq
      FROM public.cuponeras WHERE clienta_id = v_uid;

      INSERT INTO public.cuponeras (clienta_id, numero_secuencia, meta_sellos, sellos_actuales, estado)
      VALUES (v_uid, v_next_seq, v_settings.sellos_por_cuponera, 0, 'activa')
      RETURNING * INTO v_cuponera;
    END IF;

    v_room := v_cuponera.meta_sellos - v_cuponera.sellos_actuales;
    IF v_room <= 0 THEN
      UPDATE public.cuponeras
      SET estado = 'completada', completada_en = now()
      WHERE id = v_cuponera.id AND estado = 'activa';
      CONTINUE;
    END IF;
    v_apply := LEAST(v_room, v_remaining);

    UPDATE public.cuponeras
    SET sellos_actuales = sellos_actuales + v_apply
    WHERE id = v_cuponera.id
    RETURNING * INTO v_cuponera;

    INSERT INTO public.sello_events (clienta_id, cuponera_id, qr_token_id, sellos, tipo)
    VALUES (v_uid, v_cuponera.id, v_row.id, v_apply, 'canje_qr');

    v_remaining := v_remaining - v_apply;

    IF v_cuponera.sellos_actuales >= v_cuponera.meta_sellos THEN
      UPDATE public.cuponeras
      SET estado = 'completada', completada_en = now()
      WHERE id = v_cuponera.id;

      INSERT INTO public.sello_events (clienta_id, cuponera_id, qr_token_id, sellos, tipo, notas)
      VALUES (v_uid, v_cuponera.id, v_row.id, 0, 'completar_cuponera', 'Cuponera completada');
    END IF;
  END LOOP;

  UPDATE public.qr_tokens
  SET canjes_realizados = canjes_realizados + 1
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'sellos_otorgados', v_row.cantidad_sellos,
    'token_id', v_row.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_qr_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_qr_token(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS (Row Level Security)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuponeras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sello_events ENABLE ROW LEVEL SECURITY;

-- Helper: es administrador
CREATE OR REPLACE FUNCTION public.is_administrador()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'administrador'
  );
$$;

REVOKE ALL ON FUNCTION public.is_administrador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_administrador() TO authenticated;

-- profiles: cada uno ve/edita lo suyo; admin ve todos
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_administrador());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- program_settings y reward_tiers: lectura para autenticados; escritura solo admin
CREATE POLICY "program_settings_read"
  ON public.program_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "program_settings_admin_all"
  ON public.program_settings FOR ALL
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

CREATE POLICY "reward_tiers_read"
  ON public.reward_tiers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "reward_tiers_admin_all"
  ON public.reward_tiers FOR ALL
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- cuponeras: clienta solo las suyas; admin todas
CREATE POLICY "cuponeras_select"
  ON public.cuponeras FOR SELECT
  USING (clienta_id = auth.uid() OR public.is_administrador());

CREATE POLICY "cuponeras_insert_admin"
  ON public.cuponeras FOR INSERT
  WITH CHECK (public.is_administrador());

CREATE POLICY "cuponeras_update_admin"
  ON public.cuponeras FOR UPDATE
  USING (public.is_administrador());

-- qr_tokens: admin gestiona; clientas no leen la tabla directamente (canje vía RPC)
CREATE POLICY "qr_tokens_admin_all"
  ON public.qr_tokens FOR ALL
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());

-- sello_events: clienta ve las suyas; admin ve todas
CREATE POLICY "sello_events_select"
  ON public.sello_events FOR SELECT
  USING (clienta_id = auth.uid() OR public.is_administrador());

CREATE POLICY "sello_events_insert_admin"
  ON public.sello_events FOR INSERT
  WITH CHECK (public.is_administrador());

-- Nota: los inserts desde redeem_qr_token son SECURITY DEFINER y bypass RLS en sello_events/cuponeras/qr_tokens
-- si el propietario de la función es superuser/postgres — en Supabase suele funcionar.

-- -----------------------------------------------------------------------------
-- Comentario: promover tu usuario a administrador (ejecutar UNA vez con tu UUID)
-- SELECT id, email FROM auth.users;
-- UPDATE public.profiles SET role = 'administrador' WHERE id = 'TU-UUID-AQUI';
-- -----------------------------------------------------------------------------
