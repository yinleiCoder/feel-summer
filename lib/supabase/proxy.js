import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Refreshes the Supabase session once per navigation and forwards the rotated
// auth cookies to both the response and the rest of this request.
//
// This file has to be wired up from a root `proxy.js` and not an older
// `middleware.js`: Next 16 renamed the convention, and a middleware.js is simply
// never called. The failure mode is silent — no error, just users quietly
// signed out once their access token lapses.
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // The second argument carries Cache-Control / Expires / Pragma. Those
        // headers must land on the response: a CDN that caches a reply carrying
        // a Set-Cookie will hand one visitor's session to the next one.
        setAll(cookiesToSet, headers) {
          // Write onto the request too, so Server Components rendered during
          // this same navigation see the refreshed token rather than the stale
          // cookie that came in.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );

          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        }
      }
    }
  );

  // getClaims() verifies the JWT against the project's JWKS and performs the
  // refresh when the access token has expired. This one call is the entire
  // reason this file exists.
  //
  // Not getUser() — that is a network round trip on every navigation. And never
  // getSession() on the server: it decodes the cookie without revalidating it,
  // so anyone can forge one.
  await supabase.auth.getClaims();

  // Must return the response built inside setAll, not the one from the top of
  // this function — only the former carries the rotated cookies.
  return response;
}
