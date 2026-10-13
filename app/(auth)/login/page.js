import { Suspense } from 'react';

import LoginForm from '@/components/auth/LoginForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: '登录' };

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>使用你的邮箱登录知夏</CardDescription>
      </CardHeader>
      <CardContent>
        {/* LoginForm reads ?next= via useSearchParams, which needs a boundary of
            its own — the same rule that applies to any dynamic read here. */}
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
