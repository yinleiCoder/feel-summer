import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fetchBoard, normalizeBoardKey } from '@/lib/kanban';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import KanbanSkeleton from '@/components/kanban/KanbanSkeleton';

export const metadata = {
  title: '任务看板',
  description: '待制作 / 制作中 / 已完成'
};

export default function KanbanPage({ searchParams }) {
  return (
    // h-dvh + min-h-0：看板占满视口，每一栏各自滚动，页面本身不滚 ——
    // 否则拖动时页面会跟着自动滚动，落点根本对不准。
    <main className="mx-auto flex h-dvh w-full max-w-7xl flex-col px-6 pt-20 pb-6">
      {/* 无标题、无 h1：见 album/page.js 的说明。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<KanbanSkeleton />}>
          <KanbanGate searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function KanbanGate({ searchParams }) {
  // 见 album/page.js 里的说明：getClaims() 内部会调 Date.now()，
  // 不先声明请求期数据就会在预渲染时被判成 blocking route。
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) redirect('/login?next=/kanban');

  const role = claims.app_metadata?.role ?? 'user';
  // 看板和 /admin 同一档：管理员及以上。普通用户看不到这一页。
  // 界面拦截只是 UX，真正的强制在 RLS 上（tasks 的四条策略都限 admin+）。
  if (role !== 'admin' && role !== 'super_admin') redirect('/album');

  const params = await searchParams;
  const board = normalizeBoardKey(params?.board);

  const rows = await fetchBoard(supabase, board);

  return (
    <KanbanBoard
      initialRows={rows}
      board={board}
      viewer={{ id: claims.sub, role }}
    />
  );
}
