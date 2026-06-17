import { createClient } from "@supabase/supabase-js"

// Plain service-role client — no cookies, no request context. Bypasses RLS, so
// use ONLY in trusted server-side workers (background jobs). Never expose to the client.
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
