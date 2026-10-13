'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { describeAuthError } from '@/lib/auth-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const supabase = createClient();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: String(formData.get('email') ?? '').trim(),
        password: String(formData.get('password') ?? '')
      });

      if (signInError) {
        setError(describeAuthError(signInError, '登录'));
        return;
      }

      // The session cookie is written by the browser client, so Server
      // Components already see it — but their cached render does not.
      // refresh() is what makes the nav and role-gated UI catch up.
      router.replace(searchParams.get('next') || '/album');
      router.refresh();
    } catch (thrown) {
      setError(describeAuthError(thrown, '登录'));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <p aria-live="polite" className="min-h-5 text-sm break-words text-destructive">
          {error}
        </p>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? '登录中…' : '登录'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        还没有账号？{' '}
        <Link href="/register" className="text-foreground underline underline-offset-4">
          注册
        </Link>
      </p>
    </>
  );
};

export default LoginForm;
