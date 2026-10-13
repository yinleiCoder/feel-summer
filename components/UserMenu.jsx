'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, SquareKanban, UserRound } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { ROLE_LABELS } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

// 导航栏右侧、Menu 左边的账号入口。
//
// 用 DropdownMenu 而不是 Popover：这是一组动作（查看资料 / 管理 / 退出），
// 不是一块内容。菜单语义自带方向键导航、role="menu"、Esc 关闭和首字母跳转，
// Popover 是一块自由内容，这些都得自己补。
const UserMenu = ({ viewer, ready }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    // scope: 'local' —— 只清这个浏览器。全局登出会把用户其他设备一起踢掉，
    // 对一个写着「退出」的按钮来说太意外了。
    await supabase.auth.signOut({ scope: 'local' });
    setOpen(false);
    router.replace('/');
    router.refresh();
  }, [router]);

  // 登录态还没读出来时占一个等宽的位，避免导航栏在解析完成后整体位移。
  if (!ready) return <span className="size-7 shrink-0" aria-hidden="true" />;

  // 未登录不显示账号入口 —— 菜单里已经有「登录 / 注册」了。
  if (!viewer) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="账号"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar className="size-7 after:hidden">
            {viewer.avatarUrl && <AvatarImage src={viewer.avatarUrl} alt="" />}
            {/* 和资料页同一处理：默认的 bg-muted + text-muted-foreground 在深色
                导航条上几乎看不见，垫一层很淡的品牌色让它像个占位而不是坏图。 */}
            <AvatarFallback
              className="text-[11px] text-foreground/80"
              style={{ backgroundImage: `linear-gradient(135deg, #B497CF26, #5227FF33)` }}
            >
              {(viewer.displayName || '知')[0]}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={10} className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-normal">
            {viewer.displayName || '未命名'}
          </span>
          <span className="truncate text-[11px] font-normal tracking-wider text-muted-foreground">
            {ROLE_LABELS[viewer.role] ?? viewer.role}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <UserRound />
            个人资料
          </Link>
        </DropdownMenuItem>

        {/* 管理员及以上都能进管理页看用户资料；改角色的权限在页内再收一道。 */}
        {(viewer.role === 'admin' || viewer.role === 'super_admin') && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/kanban" className="cursor-pointer">
                <SquareKanban />
                任务看板
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer">
                <Settings />
                用户管理
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        {/* variant="destructive" 让它在深色底上也能一眼认出是「离开」这一类动作 */}
        <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
          <LogOut />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
