'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import StaggeredMenu from '@/components/StaggeredMenu';
import ThemeToggle from '@/components/ThemeToggle';
import UserMenu from '@/components/UserMenu';
import { useViewer } from '@/hooks/use-viewer';
import { createClient } from '@/lib/supabase/client';
import { useThemeStore } from '@/lib/store/theme-store-provider';

// 只有指向真实路由的链接才写在这里。带 onClick 的条目是动作，渲染成 button。
const BASE_ITEMS = [
  { label: '首页', ariaLabel: '返回首页', link: '/' },
  { label: '相册', ariaLabel: '浏览相册', link: '/album' }
];

const SOCIAL_ITEMS = [
  { label: 'GitHub', link: 'https://github.com/yinleiCoder' },
  { label: 'Bilibili', link: 'https://space.bilibili.com/355529756?spm_id_from=333.1007.0.0' }
];

// A client component because of two things: the theme (StaggeredMenu's button
// colour is applied by GSAP as an inline style, and GSAP cannot tween through a
// `var(...)`, so the colour arrives resolved from the store) and the session
// (登录/注册 and 管理/退出 are mutually exclusive).
//
// Shared so the (site) layout and the root 404 render the exact same bar.
export default function SiteNav() {
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  const dark = theme !== 'light';

  const { ready, viewer } = useViewer();

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    // scope: 'local' —— 只清这个浏览器。全局登出会把用户其他设备一起踢掉，
    // 对一个写着「退出」的按钮来说太意外了。
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/');
    router.refresh();
  }, [router]);

  const items = useMemo(() => {
    // 还没读出登录态时保持未登录的菜单：多显示两个链接人畜无害，
    // 而先显示「退出」再换成「登录」会闪，也更可疑。
    if (!ready || !viewer) {
      return [
        ...BASE_ITEMS,
        { label: '登录', ariaLabel: '登录', link: '/login' },
        { label: '注册', ariaLabel: '注册', link: '/register' }
      ];
    }

    const signedIn = [
      ...BASE_ITEMS,
      { label: '预约', ariaLabel: '事项预约', link: '/schedule' },
      { label: '资料', ariaLabel: '个人资料', link: '/profile' },
      // 管理页现在管理员也能进（看用户资料）；改角色仍然只有超级管理员能做，
      // 页内会相应地把角色下拉换成只读徽章。
      ...(viewer.role === 'admin' || viewer.role === 'super_admin'
        ? [
            { label: '看板', ariaLabel: '任务看板', link: '/kanban' },
            { label: '管理', ariaLabel: '用户管理', link: '/admin' }
          ]
        : []),
    ];

    return signedIn;
  }, [ready, viewer, handleLogout]);

  return (
    <StaggeredMenu
      brand="知夏"
      isFixed
      position="right"
      items={items}
      socialItems={SOCIAL_ITEMS}
      colors={['#B497CF', '#5227FF']}
      accentColor="#5227FF"
      menuButtonColor={dark ? '#f4f4f5' : '#18181b'}
      openMenuButtonColor="#111111"
      // actions 渲染在菜单按钮**左边**，所以顺序是：头像 → 主题 → Menu。
      actions={
        <>
          <UserMenu viewer={viewer} ready={ready} />
          <ThemeToggle />
        </>
      }
    />
  );
}
