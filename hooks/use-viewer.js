'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

/**
 * 当前登录者，纯客户端读取。
 *
 * 刻意不在服务端读：那会让每一个页面都变成动态渲染，而布局里的一个头像
 * 不值得整个站点放弃静态化。代价是首帧还不知道身份，所以 `ready` 单独返回 ——
 * 调用方据此渲染占位而不是先画错再改，避免闪烁。
 *
 * 返回的 role 和 RLS 策略读的是同一个 claim，所以界面上的权限判断和服务端
 * 的强制判断永远一致（要么都新，要么都旧），不会出现「看得见按钮但点了被拒」。
 */
export function useViewer() {
  const router = useRouter();
  // undefined = 还没读完；null = 确定未登录
  const [claims, setClaims] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const supabase = createClient();

    const sync = async () => {
      const { data } = await supabase.auth.getClaims();
      const next = data?.claims ?? null;
      setClaims(next);

      if (!next) {
        setProfile(null);
        return;
      }

      // 昵称和头像不在 JWT 里（那两者是公开资料，放在 claims 里只会让令牌变大
      // 且改一次昵称就得等令牌轮转）。所以单独取一次。
      const { data: row } = await supabase
        .from('profiles')
        .select('display_name,avatar_url')
        .eq('id', next.sub)
        .maybeSingle();

      setProfile(row ?? null);
    };

    sync();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        sync();
      }
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // 角色写在 JWT 里，令牌不轮转，服务端渲染的内容就不会变。
        // 刷一次 RSC 树，让上传入口和管理页跟上。
        sync();
        router.refresh();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  const ready = claims !== undefined;

  return {
    claims,
    ready,
    viewer: claims
      ? {
          id: claims.sub,
          role: claims.app_metadata?.role ?? 'user',
          displayName: profile?.display_name ?? '',
          avatarUrl: profile?.avatar_url ?? null
        }
      : null
  };
}
