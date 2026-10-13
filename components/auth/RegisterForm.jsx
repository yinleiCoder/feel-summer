'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { describeAuthError } from '@/lib/auth-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const RegisterForm = () => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }

    setPending(true);

    // try/finally, not a bare await: createClient() throws synchronously when
    // the project URL is missing, and without the finally the button would stay
    // stuck on 注册中… forever with no way to retry.
    try {
      const supabase = createClient();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Only used when email confirmation is enabled; harmless otherwise.
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (signUpError) {
        setError(describeAuthError(signUpError, '注册'));
        return;
      }

      // With "Confirm email" ON, Supabase deliberately returns a user with an
      // empty identities array for an address that already exists, instead of
      // an error — that is its enumeration protection. Saying "check your
      // inbox" here would be actively misleading.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('该邮箱已经注册过了，直接登录即可。');
        return;
      }

      // Confirmation enabled: the account exists but there is no session yet.
      if (!data?.session) {
        setNotice('注册成功，请到邮箱点开确认链接后再登录。');
        return;
      }

      router.replace('/album');
      router.refresh();
    } catch (thrown) {
      setError(describeAuthError(thrown, '注册'));
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
            autoComplete="new-password"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">确认密码</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        {/* aria-live so the message is announced, not just shown. */}
        <p aria-live="polite" className="min-h-5 text-sm break-words text-destructive">
          {error}
        </p>
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? '注册中…' : '注册'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        已经有账号了？{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          登录
        </Link>
      </p>
    </>
  );
};

export default RegisterForm;
