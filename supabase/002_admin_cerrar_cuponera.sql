-- Ejecutar en Supabase SQL Editor (una vez).
-- Cierra la cuponera activa de una clienta y abre una nueva (solo administrador).

CREATE OR REPLACE FUNCTION public.admin_cerrar_cuponera(p_clienta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta integer;
  v_row public.cuponeras%ROWTYPE;
  v_next integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_administrador() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_clienta_id AND p.role = 'clienta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clienta_no_encontrada');
  END IF;

  SELECT sellos_por_cuponera INTO v_meta
  FROM public.program_settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_meta IS NULL OR v_meta < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_configuracion');
  END IF;

  SELECT * INTO v_row
  FROM public.cuponeras
  WHERE clienta_id = p_clienta_id AND estado = 'activa'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.cuponeras (clienta_id, numero_secuencia, meta_sellos, sellos_actuales, estado)
    SELECT
      p_clienta_id,
      COALESCE((SELECT MAX(c2.numero_secuencia) FROM public.cuponeras c2 WHERE c2.clienta_id = p_clienta_id), 0) + 1,
      v_meta,
      0,
      'activa';
    RETURN jsonb_build_object('ok', true, 'accion', 'solo_nueva_activa');
  END IF;

  UPDATE public.cuponeras
  SET estado = 'completada', completada_en = now()
  WHERE id = v_row.id;

  INSERT INTO public.sello_events (clienta_id, cuponera_id, qr_token_id, sellos, tipo, notas)
  VALUES (
    p_clienta_id,
    v_row.id,
    NULL,
    0,
    'completar_cuponera',
    'Cuponera cerrada por administración (sellos al cierre: ' || v_row.sellos_actuales || '/' || v_row.meta_sellos || ')'
  );

  v_next := (SELECT COALESCE(MAX(numero_secuencia), 0) + 1 FROM public.cuponeras WHERE clienta_id = p_clienta_id);

  INSERT INTO public.cuponeras (clienta_id, numero_secuencia, meta_sellos, sellos_actuales, estado)
  VALUES (p_clienta_id, v_next, v_meta, 0, 'activa');

  RETURN jsonb_build_object(
    'ok', true,
    'accion', 'cerrada_y_nueva',
    'cuponera_anterior_id', v_row.id,
    'nueva_secuencia', v_next
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cerrar_cuponera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cerrar_cuponera(uuid) TO authenticated;
