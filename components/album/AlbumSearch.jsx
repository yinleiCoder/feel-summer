'use client';

import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';

// 相册搜索框。填充式（浅色底），和留言框、资料页的输入框是同一套语言：
// 有「面」没有「线」。聚焦时只把底色提亮一档，不加光圈。
//
// 受控组件，不做内部状态 —— 输入 → 上层 state 立刻更新（框里要实时显示），
// 真正的过滤用 debounce 后的值（见 AlbumClient）。
const AlbumSearch = ({ value, onChange, hint }) => (
  <div className="relative w-full">
    <Search
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
    />

    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="搜索标题或说明…"
      aria-label="搜索相册"
      // type=search 自带的清除按钮和下面那个自绘的重复，隐藏掉。
      className="h-11 border-transparent bg-muted pr-10 pl-10 shadow-none transition-colors focus-visible:border-transparent focus-visible:bg-muted/70 focus-visible:ring-0 dark:bg-muted dark:focus-visible:bg-muted/70 [&::-webkit-search-cancel-button]:appearance-none"
    />

    {value ? (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="清除搜索"
        className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    ) : null}

    {hint && (
      <p className="mt-2 text-[11px] tracking-wider text-muted-foreground">{hint}</p>
    )}
  </div>
);

export default AlbumSearch;
