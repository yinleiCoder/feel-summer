import { updateSession } from '@/lib/supabase/proxy';

// Next 16 renamed the `middleware.js` file convention to `proxy.js`, and the
// exported function from `middleware` to `proxy`. The runtime is always Node.js
// and cannot be configured — setting `export const runtime` here throws.
export async function proxy(request) {
  return updateSession(request);
}

// Asset requests are excluded as a correctness requirement, not just for speed.
// Supabase refresh tokens are single-use, so several parallel asset requests
// each triggering a refresh would revoke the session mid-page.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov)$).*)'
  ]
};
