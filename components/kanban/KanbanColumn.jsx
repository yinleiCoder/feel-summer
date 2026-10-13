'use client';

// 用 Fragment 而不是给 <ul> 里塞包裹层：SortableContext 的直接子元素必须是 <li>
// （卡片的 ref 挂在 li 上），插一个 div 会把列表结构弄坏。
import { Fragment } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import TaskCard from '@/components/kanban/TaskCard';
import DropIndicator from '@/components/kanban/DropIndicator';
import { columnEdge, columnTint } from '@/components/kanban/column-tint';
import { columnId, indicatorSlot } from '@/lib/kanban';

const KanbanColumn = ({ column, tasks, activeId, dropTarget, onOpenTask, onCreateTask }) => {
  // useDroppable 挂在**整栏**上，不只是列表体：松手时指针在标题栏上也算落进这一栏。
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(column.key),
    data: { type: 'column', status: column.key }
  });

  const slot =
    dropTarget?.status === column.key ? indicatorSlot(tasks, activeId, dropTarget) : null;

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${column.key}`}
      data-over={isOver || undefined}
      // 底色始终是这一栏自己的色；「可以放这里」只改描边和一圈 ring。
      //
      // 原来是 isOver 时把背景整个换成 bg-brand/5，那在加了底色之后会变成反效果 ——
      // 指针一进这一栏，底色反而被一层近乎透明的紫盖掉，看起来像高亮消失了。
      // 底色和状态拆成两件事，谁都不会覆盖谁。
      className={`flex min-h-0 flex-col rounded-xl border transition-[background-color,border-color,box-shadow] ${columnTint(
        column.key
      )} ${isOver ? 'border-brand/70 ring-2 ring-brand/25' : columnEdge(column.key)}`}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h2 className="flex items-baseline gap-2 text-[11px] tracking-[0.25em] text-muted-foreground">
          {column.label}
          <span className="tabular-nums text-muted-foreground/80">{tasks.length}</span>
        </h2>
        {/* 只有「待制作」能新建。没有加号的栏留一个同样大的占位，
            否则那一栏的标题会比另外两栏矮 8px，三栏的列表起始位置就对不齐了。 */}
        {column.creatable ? (
          <button
            type="button"
            data-testid="column-add"
            onClick={() => onCreateTask?.(column.key)}
            aria-label={`在「${column.label}」新建任务`}
            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        ) : (
          <span aria-hidden="true" className="size-6" />
        )}
      </header>

      {/* data-lenis-prevent 是必须的：整个站点包在 ReactLenis root 里，
          它监听 window 的 wheel/touch 并接管滚动。不挡住的话，在这一栏上滚轮
          会滚页面而不是滚这一栏，拖到边缘时的自动滚动也会和它打架。
          data-testid 给测试用，min-h 保证空栏也有足够的命中面积。 */}
      <div
        data-lenis-prevent
        data-testid={`column-body-${column.key}`}
        className="min-h-30 flex-1 overflow-y-auto px-3 pb-3"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {/* 没有 gap —— 卡片之间的间距由每张卡自己的 py-1 撑出来，
              这样命中区是连续的，见 TaskCard 里的说明。 */}
          <ul className="flex flex-col">
            {tasks.length === 0 && slot === null ? (
              <li
                aria-hidden="true"
                // pointer-events-none：占位说明本身不能成为碰撞目标，
                // 否则指针悬在它上面时 over 会指向它而不是这一栏。
                className="pointer-events-none flex h-22 items-center justify-center rounded-lg border border-dashed border-border/70 text-[11px] tracking-[0.2em] text-muted-foreground/80"
              >
                拖到这里
              </li>
            ) : null}

            {tasks.map((task, index) => (
              <Fragment key={task.id}>
                {slot === index ? <DropIndicator status={column.key} index={index} /> : null}
                <TaskCard task={task} onOpen={onOpenTask} />
              </Fragment>
            ))}

            {/* 落在栏尾：所有卡片之后 */}
            {slot === tasks.length && tasks.length > 0 ? (
              <DropIndicator status={column.key} index={tasks.length} />
            ) : null}
          </ul>
        </SortableContext>
      </div>
    </section>
  );
};

export default KanbanColumn;
