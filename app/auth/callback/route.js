import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Where the email-confirmation link lands. Supabase sends a one-time `code`;
// exchanging it is what actually establishes the session cookie.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/album';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback`);
}
