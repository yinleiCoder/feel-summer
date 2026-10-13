'use client';

import { UserRoundPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';

// 空画布上什么都不给，用户面对的就是一片点阵 —— 所以第一件事必须是
// 「先有你自己」。直系高亮整套逻辑都挂在「我」这个节点上，
// 没有本人，这张图就只是一堆连起来的卡片。
export default function FamilyEmptyState({ onStart }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="family-glass pointer-events-auto w-full max-w-sm rounded-2xl p-7 text-center shadow-xl">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand/12 text-brand">
          <UserRoundPlus className="size-5" />
        </span>

        <h2 className="mt-5 text-base font-medium tracking-wide">从你自己开始</h2>

        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          先把你放上画布，再往上添父母、往两边添配偶和兄弟姐妹、往下添子女。
          系统会自动认出你的直系亲属，并把这条主干点亮。
        </p>

        <Button type="button" onClick={onStart} className="mt-6 w-full">
          添加我自己
        </Button>

        <p className="mt-3 text-[11px] leading-relaxed tracking-wider text-muted-foreground/80">
          之后随时可以选中某个人，用他头顶的按钮继续添加亲戚。
        </p>
      </div>
    </div>
  );
}
