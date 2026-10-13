import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { MEDIA_COLUMNS, embeddedProfile } from '@/lib/media';
import PhotoDetail from '@/components/album/PhotoDetail';
import CommentsSection from '@/components/album/CommentsSection';
import CommentSkeleton from '@/components/album/CommentSkeleton';

export const metadata = { title: '照片' };

// 灯箱里左右切换要能在整个相册里翻页，所以这一页除了当前这条，
// 还要拿到有序的相册列表。只取元数据（对象键、尺寸、标题），一页几十 KB。
const ALBUM_LIMIT = 300;

export default function PhotoPage({ params }) {
  return (
    <main className="min-h-dvh pt-20">
      {/* params 是运行时数据，必须待在自己的边界里 —— 否则整页失去静态外壳。 */}
      <Suspense fallback={<PhotoSkeleton />}>
        <PhotoBody params={params} />
      </Suspense>
    </main>
  );
}

async function PhotoBody({ params }) {
  // 见 album/page.js 里的说明：getClaims() 内部会调 Date.now()，
  // 不先声明请求期数据就会在预渲染时被判成 blocking route。
  await connection();

  const { id } = await params;
  const supabase = await createClient();

  // MEDIA_COLUMNS 里已经带了 profiles 内联，不要再叠一次。
  const { data: row } = await supabase
    .from('media')
    .select(MEDIA_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (!row) notFound();

  // 画廊只收图片。
  //
  // 视频有自己的播放控件，塞进左右翻页里会互相抢手势（横向拖动既是翻页又是
  // 拖动进度条），而且「下一张」跳到视频上还得先加载再手动点播放，很别扭。
  // 视频就停在详情页用 <video controls> 播。
  const { data: album } = await supabase
    .from('media')
    .select(MEDIA_COLUMNS)
    .eq('kind', 'image')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ALBUM_LIMIT);

  const slides = album ?? [];
  // 当前这条是视频（或超出 ALBUM_LIMIT）时找不到，返回 -1；
  // 详情页据此决定要不要提供画廊入口。
  const index = slides.findIndex((r) => r.id === row.id);

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  // 留言框左侧要显示自己的头像和首字母，所以除了 claims 还得取一次自己的资料。
  // 一次单行查询，和上面两个并行不了（要先拿到 sub），但不值得为此绕。
  let viewer = null;
  if (claims) {
    const { data: me } = await supabase
      .from('profiles')
      .select('display_name,avatar_url')
      .eq('id', claims.sub)
      .maybeSingle();

    viewer = {
      id: claims.sub,
      role: claims.app_metadata?.role ?? 'user',
      displayName: me?.display_name ?? '',
      avatarUrl: me?.avatar_url ?? null
    };
  }

  const profile = embeddedProfile(row);
  const author = { displayName: profile.name, avatar: profile.avatar };

  // key 是必须的：在灯箱里翻页后用 router.replace 换到另一张照片时，服务端会传下
  // 新的 row，但 React 会复用同一个组件实例 —— 没有 key 的话编辑框里留着的还是
  // 上一张的标题。
  return (
    <PhotoDetail key={row.id} row={row} slides={slides} index={index} viewer={viewer} author={author}>
      {/* 留言作为 children 传进去 —— 客户端组件不能直接 import 服务端组件，
          但可以把服务端渲染好的结果当 children 接住。
          这一层 Suspense 的 fallback 就是骨架屏：留言慢只慢它自己那一段，
          图片和信息已经先流下来了。 */}
      <Suspense fallback={<CommentSkeleton />}>
        <CommentsSection mediaId={row.id} viewer={viewer} />
      </Suspense>
    </PhotoDetail>
  );
}

function PhotoSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-350 flex-col gap-6 px-4 lg:flex-row lg:px-8">
      {/* 圆角与底色跟真实左栏保持一致，否则加载完成的一瞬间会跳一下。 */}
      <div className="h-[60dvh] flex-1 animate-pulse rounded-lg bg-black/80" />
      <div className="flex w-full flex-col gap-4 lg:w-100">
        <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
