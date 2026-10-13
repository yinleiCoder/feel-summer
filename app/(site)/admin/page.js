import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { MapPin, Phone } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { listUsers } from '@/app/(site)/admin/actions';
import { ROLE_LABELS } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import RoleSelect from '@/components/admin/RoleSelect';
import RefreshSessionButton from '@/components/admin/RefreshSessionButton';

export const metadata = { title: '用户管理' };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-20 pb-24">
      {/* 无标题、无 h1：见 album/page.js 的说明。 */}
      <Suspense fallback={<AdminSkeleton />}>
        <AdminGate />
      </Suspense>
    </main>
  );
}

async function AdminGate() {
  // 见 album/page.js 里的说明：getClaims() 内部会调 Date.now()，
  // 不先声明请求期数据就会在预渲染时被判成 blocking route。
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) redirect('/login?next=/admin');

  const role = claims.app_metadata?.role ?? 'user';
  // 管理员也能看这一页（用户资料），只是改不了角色。
  if (role !== 'admin' && role !== 'super_admin') redirect('/album');

  const result = await listUsers();

  if (result.error) {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {result.error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs tracking-[0.2em] text-muted-foreground">
          共 {result.users.length} 位用户
        </span>
        <RefreshSessionButton />
      </div>

      <p className="rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        手机号和家庭住址属于用户的私有资料，只有管理员及以上能看到。
        {result.canManageRoles
          ? '角色写进登录令牌，改完对方需要刷新会话（或重新登录）才生效。'
          : '角色的调整由超级管理员负责。'}
      </p>

      <ul className="flex flex-col gap-3">
        {result.users.map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-start gap-4 rounded-xl border border-border/60 p-4"
          >
            <Avatar size="lg" aria-hidden="true">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback>{(user.displayName || user.email || '知')[0]}</AvatarFallback>
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium">
                  {user.displayName || '未命名'}
                </span>
                <span className="truncate text-xs tracking-wider text-muted-foreground">
                  {user.email}
                </span>
                {user.id === claims.sub && (
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] tracking-[0.15em] text-muted-foreground">
                    这是你
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tracking-wider text-muted-foreground/80">
                <span>{ROLE_LABELS[user.role] ?? user.role}</span>
                <span>
                  {user.lastSignInAt
                    ? `最近登录 ${new Date(user.lastSignInAt).toLocaleDateString('zh-CN')}`
                    : '从未登录'}
                </span>
                <span>{new Date(user.createdAt).toLocaleDateString('zh-CN')} 注册</span>
              </div>

              {/* 联系方式单独一行：它们是这一页新增的信息，混在元数据里会看不见。 */}
              <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                  {user.phone || <span className="text-muted-foreground/80">未填写</span>}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {user.address || <span className="text-muted-foreground/80">未填写</span>}
                </span>
              </div>
            </div>

            {result.canManageRoles ? (
              <RoleSelect userId={user.id} role={user.role} />
            ) : (
              <span className="shrink-0 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-4 rounded-xl border border-border/60 p-4">
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
