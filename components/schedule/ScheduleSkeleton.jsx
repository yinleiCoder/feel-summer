// 骨架屏照抄日历的形状：工具栏一条、星期表头一条、下面一片网格。
// 形状对上了，日历挂载时不会整体跳一下 —— 站内其他骨架屏也是这个思路。

const HEADER_CELLS = Array.from({ length: 7 }, (_, index) => index);
const GRID_CELLS = Array.from({ length: 35 }, (_, index) => index);

export default function ScheduleSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      </div>

      <div className="min-h-0 flex-1 rounded-xl border border-border p-3">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {HEADER_CELLS.map((cell) => (
            <div key={cell} className="h-5 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {GRID_CELLS.map((cell) => (
            <div key={cell} className="h-16 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
