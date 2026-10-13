import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { FAMILY_TREE_COLUMNS } from '@/lib/family/data';
import FamilyTreeEditor from '@/components/family/FamilyTreeEditor';

export const metadata = {
  title: '家庭关系图',
  description: '用可拖拽的节点整理父母、配偶、子女与兄弟姐妹'
};

export default function FamilyTreePage() {
  return (
    // h-dvh 而不是 min-h-screen：这是一个画布编辑器，页面本身不该能滚动 ——
    // 一旦 body 能滚，React Flow 的滚轮缩放就会和页面滚动打架。
    // pt-20 让开 (site) 布局里那条固定导航（约 60px，z-index 40）。
    <main className="flex h-dvh flex-col overflow-hidden pt-20">
      {/* 无标题、无 h1：见 album/page.js 的说明。
          留下来的这一行是操作提示，不是标题 —— 窄屏上它整行让位给画布高度。 */}
      <p className="hidden px-6 pt-3 pb-4 text-[11px] tracking-wider text-muted-foreground/80 sm:block">
        拖拽移动 · 滚轮缩放 · Delete 删除 · 直系亲属自动点亮
      </p>

      {/* 静态外壳先出，依赖会话的部分流式补上。
          cacheComponents 打开之后，读 session 的组件必须坐在 Suspense 边界后面，
          否则在边界外读 cookies() 是构建期错误而不是警告。 */}
      <Suspense fallback={<FamilyTreeSkeleton />}>
        <FamilyTreeSection />
      </Suspense>
    </main>
  );
}

async function FamilyTreeSection() {
  // 见 album/page.js 的说明：getClaims() 内部要校验 JWT 的 exp、会调 Date.now()，
  // 不先声明这是请求期数据，预渲染阶段就被判成 blocking route。
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) redirect('/login?next=/family-tree');

  // 关系图和资料一起取：空图引导要拿资料页的名字和头像做第一个节点，
  // 串行发两次请求会让首屏多等一个来回。
  const [{ data: tree, error: treeError }, { data: profile }] = await Promise.all([
    supabase
      .from('family_trees')
      .select(FAMILY_TREE_COLUMNS)
      .eq('user_id', claims.sub)
      .maybeSingle(),
    supabase.from('profiles').select('display_name,avatar_url').eq('id', claims.sub).maybeSingle()
  ]);

  // 读失败和「还没有关系图」必须分开处理。
  //
  // 读失败时如果照常把一份空图交给编辑器，用户看到的是「从你自己开始」，
  // 而编辑器一有改动就会把空图写回去 —— 等于把已有的关系图删了。
  // 宁可什么都不给，也不要给一份会被保存的空图。
  if (treeError) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        关系图加载失败，请刷新重试。
      </p>
    );
  }

  return (
    <FamilyTreeEditor
      userId={claims.sub}
      initialGraph={tree?.graph ?? null}
      initialRevision={tree?.revision ?? null}
      initialUpdatedAt={tree?.updated_at ?? null}
      displayName={profile?.display_name ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}

function FamilyTreeSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-border/60 px-6 py-2.5">
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-44 animate-pulse rounded-md bg-muted" />
        <div className="ml-auto h-6 w-24 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 animate-pulse bg-muted/25" />
        <div className="h-[45dvh] shrink-0 border-t border-border/60 lg:h-auto lg:w-[320px] lg:border-t-0 lg:border-l" />
      </div>
    </div>
  );
}
