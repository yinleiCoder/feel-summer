import { columnEdge, columnTint } from '@/components/kanban/column-tint';
import { BOARD_COLUMNS } from '@/lib/kanban';

// 形状要和真实版式一致（三栏、每栏标题位置、卡片高度），否则加载完成时会跳一下。
// 底色也走同一份 columnTint/columnEdge —— 骨架屏是白的、真栏是带色的，那还是跳。
const COLUMN_CARD_HEIGHTS = [
  ['h-16', 'h-24', 'h-16'],
  ['h-24', 'h-16'],
  ['h-16', 'h-20']
];

const KanbanSkeleton = () => (
  <div
    className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-4 lg:grid-cols-3"
    aria-hidden="true"
  >
    {COLUMN_CARD_HEIGHTS.map((heights, i) => {
      const status = BOARD_COLUMNS[i]?.key;
      return (
        <div
          key={i}
          className={`flex flex-col rounded-xl border p-4 ${columnTint(status)} ${columnEdge(status)}`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3 w-4 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col gap-2">
            {/* bg-card 而不是 bg-muted：卡片占位要读起来像「浮在栏上」，
                真卡片就是 --card，用 muted 的话和栏底色几乎同色。 */}
            {heights.map((h, j) => (
              <div key={j} className={`${h} animate-pulse rounded-lg bg-card`} />
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

export default KanbanSkeleton;
