-- =============================================================================
-- Lista para administradoras: clientas con estado de confirmación de correo
-- (auth.users). Ejecutar en Supabase → SQL Editor.
-- Requiere función public.is_administrador() (001_schema_anet_estudio.sql).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_clientas_auth_status()
RETURNS TABLE (
  id uuid,
  email text,
  nombre text,
  email_confirmed_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_administrador() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(u.email::text, '') AS email,
    p.nombre,
    u.email_confirmed_at,
    u.created_at
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id AND p.role = 'clienta'
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_clientas_auth_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_clientas_auth_status() TO authenticated;

COMMENT ON FUNCTION public.admin_list_clientas_auth_status IS
  'Solo administradoras: id, email, nombre, email_confirmed_at y alta en Auth.';
