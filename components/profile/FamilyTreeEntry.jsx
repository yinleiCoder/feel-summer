import { ArrowUpRight } from 'lucide-react';

import './FamilyTreeEntry.css';

// 用 <a target="_blank"> 而不是 next/link。
//
// 这是开在新标签页里的，新标签页必然走一次完整的文档加载，客户端路由和 prefetch
// 一点用都没有（prefetch 甚至是有害的：预取一个需要鉴权的动态页纯属浪费）。
// 仓库里已有的两处新标签页链接（StaggeredMenu 的社交链接、(auth)/layout 的署名）
// 也都是原生 <a>。
const FamilyTreeEntry = () => (
  <a
    href="/family-tree"
    target="_blank"
    rel="noopener noreferrer"
    className="family-entry group relative mb-12 flex items-center gap-5 overflow-hidden rounded-2xl border border-border/60 bg-card/40 px-6 py-5 transition-colors hover:border-brand/45 hover:bg-card/70 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
  >
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#B497CF]/25 to-[#5227FF]/18 text-brand"
    >
      {/* 三个点连成一条线：最小的关系图 */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 5.6v3.2M10 8.8H5.2v2.4M10 8.8h4.8v2.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="10" cy="4" r="2" fill="currentColor" />
        <circle cx="5.2" cy="13.6" r="2" fill="currentColor" />
        <circle cx="14.8" cy="13.6" r="2" fill="currentColor" />
      </svg>
    </span>

    <span className="min-w-0 flex-1">
      <span className="block text-[11px] tracking-[0.35em] text-muted-foreground/80">
        FAMILY TREE
      </span>
      <span className="mt-1 block text-base font-medium tracking-wide">家庭关系图</span>
      <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
        用可拖拽的节点整理父母、配偶、子女与兄弟姐妹，直系亲属以蚂蚁流动线高亮。
      </span>
    </span>

    <span className="hidden shrink-0 items-center gap-1.5 self-start text-[11px] tracking-wider text-muted-foreground/80 transition-colors group-hover:text-brand sm:flex">
      新标签页
      <ArrowUpRight className="size-3.5" />
    </span>

    {/* 下缘的那条流动线，只在 hover / 键盘聚焦时亮起来 */}
    <span aria-hidden="true" className="family-entry__ants" />
  </a>
);

export default FamilyTreeEntry;
