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
  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function by Supabase.
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const db = supabaseDb(admin)
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
