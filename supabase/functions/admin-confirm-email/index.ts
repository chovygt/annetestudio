import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'No autorizado' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Configuración del servidor incompleta' }, 500)
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, '')

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return json({ error: 'Sesión inválida' }, 401)
  }

  const { data: prof, error: profErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profErr || prof?.role !== 'administrador') {
    return json({ error: 'Solo administradoras' }, 403)
  }

  let body: { targetUserId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const targetUserId = body.targetUserId
  if (!targetUserId || typeof targetUserId !== 'string') {
    return json({ error: 'Falta targetUserId' }, 400)
  }

  const { data: targetProf, error: tpErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()

  if (tpErr || targetProf?.role !== 'clienta') {
    return json({ error: 'Usuario no encontrado o no es clienta' }, 400)
  }

  const { error: updErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
    email_confirm: true,
  })

  if (updErr) {
    return json({ error: updErr.message }, 400)
  }

  return json({ ok: true }, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
