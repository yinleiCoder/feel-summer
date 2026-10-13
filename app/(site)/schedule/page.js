import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import ScheduleClient from '@/components/schedule/ScheduleClient';
import ScheduleSkeleton from '@/components/schedule/ScheduleSkeleton';
import { fetchAppointments } from '@/lib/appointments';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: '预约',
  description: '知夏 —— 事项预约'
};

export default function SchedulePage() {
  return (
    // 日历要撑满视口才好用，所以这里给 main 一个确定高度，
    // 让下面整条 flex 链（main -> div -> ScheduleClient -> 日历）能算出实际尺寸。
    <main className="mx-auto flex h-dvh w-full max-w-[1400px] flex-col px-6 pt-20 pb-8">
      {/* cacheComponents 开着，超出一层 boundary 去读 cookies() 是构建错误。
          只有依赖会话的日历在流式补上。
          无标题、无 h1：见 album/page.js 的说明。 */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<ScheduleSkeleton />}>
          <ScheduleSection />
        </Suspense>
      </div>
    </main>
  );
}

async function ScheduleSection() {
  // 必须先声明这是请求期数据，否则会报：
  //   Route "/schedule": Next.js encountered the unstable value `Date.now()` while prerendering.
  // 根源是 supabase.auth.getClaims() —— 它内部要校验 JWT 的 exp，调了 Date.now()。
  // 详见 app/(site)/album/page.js 里那段更长的说明。
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  // 只是 UX 门禁 —— 真正的强制在 RLS：四条策略都要求 user_id = auth.uid()，
  // 绕开这个跳转也读不到、写不进别人的预约。
  if (!claims) redirect('/login?next=/schedule');

  const viewer = { id: claims.sub, role: claims.app_metadata?.role ?? 'user' };

  // 首屏数据在服务端取好，日历一挂载就有内容，不用先空一下再补。
  let appointments;
  try {
    appointments = await fetchAppointments(supabase);
  } catch {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        预约加载失败，请刷新重试。
      </p>
    );
  }

  return <ScheduleClient initialAppointments={appointments} viewer={viewer} />;
}
