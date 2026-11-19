// Shared wrapper for Aux's Supabase Edge Functions: CORS, the signed-in student, JSON in and out.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { UserError, type Db } from './handlers.ts'
import { supabaseDb } from './supabaseDb.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const env = (k: string) => Deno.env.get(k) ?? ''

export function serve(handler: (body: Record<string, unknown>, ctx: { uid: string; db: Db }) => Promise<unknown>) {
  // Supabase provides SUPABASE_URL and a server key to every Edge Function: SUPABASE_SERVICE_ROLE_KEY (legacy keys)
  // or SUPABASE_SECRET_KEYS (newer projects, a JSON object of named secret keys). Accept either.
  const serverKey = env('SUPABASE_SERVICE_ROLE_KEY') || (() => {
    try { const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'); return keys.default ?? Object.values(keys)[0] ?? '' } catch { return '' }
  })()
  const admin = createClient(env('SUPABASE_URL'), serverKey as string, { auth: { persistSession: false } })
  const db = supabaseDb(admin)
  // Deployed with verify_jwt off: this checks the signed-in student itself (getUser below), which also works
  // with Supabase's newer signing keys.
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    try {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
      const { data, error } = await admin.auth.getUser(jwt)
      if (error || !data.user) return json({ error: 'Sign in first.' }, 401)
      const body = await req.json().catch(() => ({}))
      return json(await handler(body, { uid: data.user.id, db }))
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, 400)
      console.error(e)
      return json({ error: e instanceof Error ? e.message : 'Something went wrong' }, 500)
    }
  })
}
