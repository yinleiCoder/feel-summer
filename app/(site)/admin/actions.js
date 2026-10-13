'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLES } from '@/lib/roles';

const roleOf = (user) => user?.app_metadata?.role ?? 'user';

// 每个 Server Action 都能被直接 POST 打到，不只是从界面点进来，
// 所以每一次都重新从会话里取身份和角色，不信客户端传上来的任何东西。
async function requireRole(allowed) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) return { error: '请先登录。' };

  const role = claims.app_metadata?.role ?? 'user';
  if (!allowed.includes(role)) {
    return { error: '没有权限执行这个操作。' };
  }

  return { callerId: claims.sub, callerRole: role, supabase };
}

// 看用户列表和资料：管理员即可。
const requireAdmin = () => requireRole(['admin', 'super_admin']);
// 改角色：只有超级管理员。管理员能被任命，但不能互相任命。
const requireSuperAdmin = () => requireRole(['super_admin']);

function adminClientOrError() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return {
      error:
        '缺少 SUPABASE_SECRET_KEY。请到 Supabase 控制台 Project Settings → API keys 复制 secret key，填入 .env.local 后重启 dev server。'
    };
  }
  return { admin: createAdminClient() };
}

export async function listUsers() {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };

  const client = adminClientOrError();
  if (client.error) return { error: client.error };

  const { data, error } = await client.admin.auth.admin.listUsers({ perPage: 200 });
  if (error) return { error: '读取用户列表失败。' };

  const identities = data?.users ?? [];
  if (!identities.length) return { users: [], canManageRoles: auth.callerRole === 'super_admin' };

  // 公开资料和私有资料分两张表取。
  //
  // profiles 本来就是公开可读的；profile_private 刚刚放开了 admin 读取
  // （见迁移 admins_can_read_all_profiles）。两条查询都走**调用者自己的会话**，
  // 也就是由 RLS 决定能拿到什么 —— 而不是用 secret key 绕过它。
  const ids = identities.map((u) => u.id);
  const [{ data: profiles }, { data: contacts }] = await Promise.all([
    auth.supabase.from('profiles').select('id,display_name,avatar_url').in('id', ids),
    auth.supabase.from('profile_private').select('id,phone,address').in('id', ids)
  ]);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

  const users = identities
    .map((user) => ({
      id: user.id,
      email: user.email,
      role: roleOf(user),
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      displayName: byId.get(user.id)?.display_name ?? '',
      avatarUrl: byId.get(user.id)?.avatar_url ?? null,
      phone: contactById.get(user.id)?.phone ?? '',
      address: contactById.get(user.id)?.address ?? ''
    }))
    // 权限高的在前，其次按注册时间倒序 —— 最可能要找的人在最上面。
    .sort((a, b) => {
      const rank = { super_admin: 0, admin: 1, user: 2 };
      return rank[a.role] - rank[b.role] || b.createdAt.localeCompare(a.createdAt);
    });

  return { users, canManageRoles: auth.callerRole === 'super_admin' };
}

export async function setUserRole(userId, nextRole) {
  const auth = await requireSuperAdmin();
  if (auth.error) return { error: auth.error };

  if (!ROLES.includes(nextRole)) return { error: '无效的角色。' };

  const client = adminClientOrError();
  if (client.error) return { error: client.error };

  const { data: target, error: readError } = await client.admin.auth.admin.getUserById(userId);
  if (readError || !target?.user) return { error: '找不到该用户。' };

  // 拒绝任何会让站点失去最后一位超级管理员的操作。这一条同时覆盖了
  // 「自我降级」和「降级最后一位」—— 两者都会把所有人永久锁在管理页之外，
  // 只能靠手写 SQL 恢复。
  if (roleOf(target.user) === 'super_admin' && nextRole !== 'super_admin') {
    const { data: all } = await client.admin.auth.admin.listUsers({ perPage: 1000 });
    const remaining = (all?.users ?? []).filter(
      (user) => user.id !== userId && roleOf(user) === 'super_admin'
    );
    if (!remaining.length) {
      return { error: '至少要保留一位超级管理员。' };
    }
  }

  // 读-改-写，而不是只传 { role }。app_metadata 里还有 GoTrue 自己的
  // provider / providers 两个键，覆盖掉会让该账号下次登录时身份解析失败。
  const nextMetadata = { ...(target.user.app_metadata ?? {}), role: nextRole };

  const { error: updateError } = await client.admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMetadata
  });
  if (updateError) return { error: '保存失败，请稍后重试。' };

  revalidatePath('/admin');
  return { ok: true, refreshedSelf: userId === auth.callerId };
}
