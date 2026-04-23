-- Bucket y políticas de Storage para comprobantes / fotos (compras, pagos, cobros, etc.)
-- Ejecuta este script en Supabase: SQL → New query → Run
-- (O crea el bucket "facturas" en Dashboard → Storage → New bucket, y luego solo las policies.)

-- 1) Crear bucket público (la app usa getPublicUrl)
-- Si el INSERT falla por columnas, en Dashboard → Storage → New bucket: nombre "facturas", Public ON.
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas', 'facturas', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- 2) Políticas RLS en storage.objects (re-ejecutar: borra y vuelve a crear nombres únicos)
DROP POLICY IF EXISTS "facturas_public_read" ON storage.objects;
DROP POLICY IF EXISTS "facturas_administradores_insert" ON storage.objects;
DROP POLICY IF EXISTS "facturas_administradores_update" ON storage.objects;
DROP POLICY IF EXISTS "facturas_administradores_delete" ON storage.objects;

-- Cualquiera con el enlace puede leer (URLs públicas)
CREATE POLICY "facturas_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'facturas');

-- Solo administradores (usa la misma función que el resto del esquema)
CREATE POLICY "facturas_administradores_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'facturas' AND public.is_administrador());

CREATE POLICY "facturas_administradores_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'facturas' AND public.is_administrador())
WITH CHECK (bucket_id = 'facturas' AND public.is_administrador());

CREATE POLICY "facturas_administradores_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'facturas' AND public.is_administrador());
