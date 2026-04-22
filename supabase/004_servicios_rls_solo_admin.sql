-- Si ya ejecutaste una versión anterior de 003 donde `servicios` tenía lectura
-- para todo `authenticated`, corre este parche para dejarlo solo administración.

DROP POLICY IF EXISTS "servicios_read_authenticated" ON public.servicios;
DROP POLICY IF EXISTS "servicios_admin_write" ON public.servicios;
DROP POLICY IF EXISTS "servicios_admin_update" ON public.servicios;
DROP POLICY IF EXISTS "servicios_admin_delete" ON public.servicios;
DROP POLICY IF EXISTS "servicios_admin_all" ON public.servicios;

CREATE POLICY "servicios_admin_all"
  ON public.servicios FOR ALL
  TO authenticated
  USING (public.is_administrador())
  WITH CHECK (public.is_administrador());
