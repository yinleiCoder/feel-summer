import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import FamilyTreeEntry from '@/components/profile/FamilyTreeEntry';
import ProfileForm from '@/components/profile/ProfileForm';

export const metadata = {
  title: '个人资料',
  description: '修改用户名、头像和联系方式'
};

export default function ProfilePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-20 pb-24">
      {/* 无标题、无 h1：见 album/page.js 的说明。 */}

      {/* 放在 Suspense 外面：这块不读会话，属于静态外壳，首屏立刻就在。
          塞进 Suspense 只会让它白等一次鉴权往返。 */}
      <FamilyTreeEntry />

      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileSection />
      </Suspense>
    </main>
  );
}

async function ProfileSection() {
  // 见 album/page.js 里的说明：getClaims() 内部会调 Date.now()，
  // 不先声明请求期数据就会在预渲染时被判成 blocking route。
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) redirect('/login?next=/profile');

  // 两张表各查一次：profiles 是公开的门面，profile_private 只有本人读得到。
  // 这里不 join —— 它们的关系是「同一个人的两组字段」，不是主从。
  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,display_name,avatar_url,created_at')
      .eq('id', claims.sub)
      .maybeSingle(),
    supabase.from('profile_private').select('phone,address').eq('id', claims.sub).maybeSingle()
  ]);

  return (
    <ProfileForm
      userId={claims.sub}
      email={claims.email}
      role={claims.app_metadata?.role ?? 'user'}
      profile={profile}
      contact={contact}
    />
  );
}

// 骨架的形状要和真实版式一致（两栏、头像尺寸、分区），否则加载完成时会跳一下。
function ProfileSkeleton() {
  return (
    <div className="grid gap-14 lg:grid-cols-[300px_1fr]" aria-hidden="true">
      <div className="flex flex-col items-center gap-7 lg:items-start">
        <div className="size-32 animate-pulse rounded-full bg-muted" />
        <div className="flex w-full flex-col items-center gap-3 lg:items-start">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-44 animate-pulse rounded bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
        </div>
      </div>

      <div className="flex flex-col gap-12">
        {[0, 1].map((section) => (
          <div key={section} className="flex flex-col gap-6">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            {section === 1 && (
              <>
                <div className="h-11 animate-pulse rounded-lg bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
