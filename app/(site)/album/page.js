import { Suspense } from 'react';
import { connection } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { fetchPage } from '@/lib/media';
import AlbumClient from '@/components/album/AlbumClient';
import AlbumSkeleton from '@/components/album/AlbumSkeleton';

export const metadata = {
  title: '相册',
  description: '知夏 —— 照片与视频'
};

export default function AlbumPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 pt-20 pb-24">
      {/* cacheComponents is on, so reading cookies() outside a boundary is a
          build error rather than a warning. Only the session-dependent grid
          streams in.

          No visible title, and no h1 behind it either: the nav already says
          which page this is, and the page name lives in metadata.title. Content
          starts straight away. Other pages point here for the same rule. */}
      <Suspense fallback={<AlbumSkeleton />}>
        <AlbumSection />
      </Suspense>
    </main>
  );
}

async function AlbumSection() {
  // 必须先声明这是请求期数据，否则会报：
  //   Route "/album": Next.js encountered the unstable value `Date.now()` while prerendering.
  //
  // 根源是 supabase.auth.getClaims() —— 它内部要校验 JWT 的 exp，调用了 Date.now()
  // （@supabase/auth-js 里 `const timeNow = Date.now() / 1000`）。预渲染阶段碰到任何
  // 不稳定取值，Next 就把整条路由判成 blocking route。
  //
  // 光有 await cookies()（createClient 内部会做）不够：开了 cacheComponents 之后，
  // 预渲染阶段允许读 cookie —— 那正是 Next 判断边界的方式。connection() 才是明确的
  // 「这里绝对不可预渲染」。
  await connection();

  const supabase = await createClient();

  // getClaims(), never getSession(): the latter decodes the cookie without
  // verifying its signature, so it cannot be trusted on the server.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  const viewer = claims
    ? { id: claims.sub, role: claims.app_metadata?.role ?? 'user' }
    : null;

  // Data is fetched on the server so the first page is in the RSC payload and
  // needs no client round trip on load. Later pages come from the browser
  // client, which RLS protects just the same.
  let first;
  try {
    first = await fetchPage(supabase, null);
  } catch {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        相册加载失败，请刷新重试。
      </p>
    );
  }

  return (
    <AlbumClient
      initialItems={first.items}
      initialCursor={first.nextCursor}
      initialHasMore={first.hasMore}
      viewer={viewer}
    />
  );
}
