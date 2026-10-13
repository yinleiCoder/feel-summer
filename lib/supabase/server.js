import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Request-scoped server client, for Server Components, Server Actions and route
// handlers. Create a new one per request — never hoist it to module scope.
export async function createClient() {
  // Next 16: cookies() is async. Synchronous access was removed outright, not
  // merely deprecated.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        // @supabase/ssr 0.12.x: getAll/setAll. The old get/set/remove triple is
        // gone — passing it silently does nothing and the session never persists.
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // A Server Component render gets a read-only cookie store, so this
            // throws there. Swallowing it is correct: proxy.js is what actually
            // refreshes the session on every navigation, so nothing is lost.
            // In a Server Action or route handler the write succeeds normally.
          }
        }
      }
    }
  );
}
