import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import UploadDropzone from '@/components/album/UploadDropzone';

export const metadata = { title: '上传' };

export default function UploadPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 pt-20 pb-24">
      {/* 无标题、无 h1：见 album/page.js 的说明。 */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <UploadGate />
      </Suspense>
    </main>
  );
}

async function UploadGate() {
  // 见 album/page.js 里的说明：getClaims() 内部会调 Date.now()，
  // 不先声明请求期数据就会在预渲染时被判成 blocking route。
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  // UX gate only — RLS is the actual enforcement. A plain 'user' who bypasses
  // this entirely still cannot insert into public.media or storage.objects.
  if (!claims) redirect('/login?next=/upload');

  const role = claims.app_metadata?.role ?? 'user';
  if (role !== 'admin' && role !== 'super_admin') redirect('/album');

  return <UploadDropzone viewer={{ id: claims.sub, role }} />;
}
