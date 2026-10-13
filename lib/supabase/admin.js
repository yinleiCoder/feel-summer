import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Secret-key client. Bypasses RLS completely, so it must never be reachable from
// the browser: the `server-only` import above turns an accidental client import
// into a build error rather than a leaked key.
//
// Only /admin uses this, and only to read and write auth.users.app_metadata —
// ordinary data access goes through the request-scoped clients so that RLS
// still applies.
export function createAdminClient() {
  // Constructed lazily inside the caller. At module scope a missing env var
  // would throw during `next build` instead of at request time.
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
