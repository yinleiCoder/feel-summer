import { createBrowserClient } from '@supabase/ssr';

// Browser client. Only ever import this from a component marked 'use client'.
//
// createBrowserClient memoises internally, so every call in a tab returns the
// same instance. That matters more than it looks: a Supabase refresh token is
// single-use, so two GoTrue clients in one tab racing to refresh the same token
// would revoke each other's session.
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
