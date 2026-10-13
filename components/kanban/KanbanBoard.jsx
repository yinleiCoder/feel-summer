'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import { createClient } from '@/lib/supabase/client';
import {
  BOARD_COLUMNS,
  COLUMN_PREFIX,
  applyMove,
  groupByStatus,
  isColumnId,
  resolveDropTarget,
  statusFromColumnId
} from '@/lib/kanban';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import TaskCard from '@/components/kanban/TaskCard';
import TaskDialog from '@/components/kanban/TaskDialog';

const KanbanBoard = ({ initialRows, board, viewer }) => {
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState(initialRows);
  const [activeId, setActiveId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  // onDragOver 每帧都可能触发，但 onDragEnd 只在松手时有一次。
  // 落点用 ref 存一份，保证「线上画的」和「实际落的」永远是同一个值 ——
  // 只读 state 的话，最后一次 onDragOver 可能还没提交就被 onDragEnd 读走。
  const dropTargetRef = useRef(null);
  const activeRectWidth = useRef(null);

  const grouped = useMemo(() => groupByStatus(rows), [rows]);
  const activeTask = activeId ? rows.find((r) => r.id === activeId) : null;

  const titleOf = useCallback(
    (id) => rows.find((r) => r.id === id)?.title || '这张卡',
    [rows]
  );

  // MouseSensor + TouchSensor，不用 PointerSensor。
  //
  // PointerSensor 也吃触摸的 pointerdown，除非给每张卡加 touch-action: none ——
  // 而那样一来手指就再也滚不动这一栏了。分开之后：鼠标要位移 6px 才算拖，
  // 触屏要长按 250ms，轻点仍然是 click（弹窗照常打开），原生触摸滚动不受影响。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 默认的 rectIntersection 在三栏并排时是错的：拖动中的卡片会同时和多栏的矩形
  // 相交，over 在它们之间闪，落点线跟着跳。
  //
  // 改用 dnd-kit 官方的多容器配方：pointerWithin 为主（它才能让**空栏**可达），
  // 指针落在某栏的空白处时再退一步选离得最近的那张卡 —— 否则卡片之间的缝隙
  // 会变成够不到的死区，落点只能卡在栏尾。
  const collisionDetection = useCallback((args) => {
    const collisions = pointerWithin(args);
    // 键盘拖动时没有指针，pointerWithin 恒为空 —— 退回矩形相交。
    if (collisions.length === 0) return rectIntersection(args);

    // 指针压在卡片上时用那张卡，而且必须**主动挑**卡片出来，不能拿 collisions[0]：
    // 卡片和它所在的整栏会同时命中，谁排在前面取决于 dnd-kit 内部的遍历顺序。
    //
    // 原来这里是在命中栏之后再补一次 closestCenter，那等于承认「指针在栏的空白处」
    // 和「指针在卡片上」会走进同一个分支 —— 一栏只有一张卡时，指针远在它下方的空白里
    // 也会被算成悬停在它上面，落点于是跑到栏首去。
    const card = collisions.find((c) => !isColumnId(c.id));
    if (card) return [{ id: card.id }];

    // 只命中栏，说明指针在卡片之外的空白处，含义就是栏尾。
    // 卡片上下的 4px 缓冲（见 TaskCard 的 py-1）保证了卡片之间的缝隙不会掉进这一支。
    const column = collisions.find((c) => isColumnId(c.id));
    return column ? [{ id: column.id }] : [];
  }, []);

  const handleDragStart = useCallback(({ active }) => {
    setActiveId(active.id);
    setError(null);
    // DragOverlay 里的副本要和它原来那一栏同宽，否则一拿起来就变形。
    activeRectWidth.current = active.rect.current.initial?.width ?? null;
  }, []);

  const handleDragOver = useCallback(
    ({ active, over }) => {
      const target = resolveDropTarget(rows, active.id, over);
      dropTargetRef.current = target;
      setDropTarget((prev) =>
        prev?.status === target?.status && prev?.index === target?.index ? prev : target
      );
    },
    [rows]
  );

  const reset = useCallback(() => {
    setActiveId(null);
    setDropTarget(null);
    dropTargetRef.current = null;
  }, []);

  const handleDragEnd = useCallback(
    async ({ active }) => {
      const target = dropTargetRef.current;
      const before = rows;
      reset();

      if (!target || active.id === undefined) return;

      const moved = before.find((r) => r.id === active.id);
      // 原地没动就别写库了 —— 松手在原来的位置上是最常见的一次「拖动」。
      if (!moved || (moved.status === target.status && moved.position === target.index)) return;

      // 乐观更新：界面先动，网络在后面追。
      setRows(applyMove(before, active.id, target.status, target.index));

      const { error: rpcError } = await supabase.rpc('move_task', {
        p_task_id: active.id,
        p_status: target.status,
        p_index: target.index
      });

      if (rpcError) {
        // 回滚到拖动之前的整份快照，而不是「再反向挪一次」——
        // 反向挪要重新算下标，而算错的机会正是这里最不该有的。
        setRows(before);
        setError('移动没有保存成功，已恢复原位。');
      }
    },
    [rows, reset, supabase]
  );

  const handleDragCancel = useCallback(() => {
    reset();
  }, [reset]);

  // 「每一次拿起、移动、放下，都有反馈」——键盘用户看不到落点线，
  // 这条 live region 就是他唯一的信息来源，所以四步都要播报。
  //
  // dnd-kit 自己就会渲染这个 live region，本来不必插手。之所以还要指定落点，
  // 是为了把这个节点攥在自己手里：它的 id 来自
  //   useUniqueId('DndLiveRegion')      // 第二参数没传
  // 走的是模块级计数器，每次加载的编号都可能不同，外部没法稳定地找到它。
  //
  // 注意 container 要的是 **DOM 元素本身**，不是 ref 对象 ——
  //   return container ? createPortal(markup, container) : markup;
  // 传 ref 进去它是个真值，会一路走到 createPortal 然后抛
  //   Target container is not a DOM element.
  // 而首帧时元素还不存在，所以用回调 ref 存进 state，挂载后再换过来。
  const [liveEl, setLiveEl] = useState(null);
  const accessibility = useMemo(
    () => ({
      container: liveEl ?? undefined,
      announcements: {
        onDragStart: ({ active }) =>
          `已拿起「${titleOf(active.id)}」。用方向键移动，空格放下，Esc 取消。`,
        onDragOver: ({ active, over }) => {
          if (!over) return '不在任何位置上方。';
          // 键盘拿起的那一瞬间，over 就是被拿起的那张卡自己。此时播报
          // 「将落在「甲」附近」既没有信息量，又会把刚播出去的「已拿起」顶掉 ——
          // 而「已拿起」正是用户确认「真的拿起来了」的唯一凭据。
          // 返回 null，dnd-kit 会忽略这次播报，上一条留在原地。
          if (String(over.id) === String(active.id)) return null;
          if (isColumnId(over.id)) {
            const label = BOARD_COLUMNS.find((c) => c.key === statusFromColumnId(over.id))?.label;
            return `将落在「${label}」栏末尾。`;
          }
          return `将落在「${titleOf(over.id)}」附近。`;
        },
        // 一律用事件里的 active.id，不读 activeId 这个 state：handleDragEnd 开头
        // 就 reset() 把它清成 null 了，谁先谁后取决于 React 什么时候提交，
        // 赌输的那次会播报成「已把「这张卡」放进…」。
        onDragEnd: ({ active, over }) => {
          if (!over) return `已放下「${titleOf(active.id)}」，位置没有改变。`;
          const label = isColumnId(over.id)
            ? BOARD_COLUMNS.find((c) => c.key === statusFromColumnId(over.id))?.label
            : null;
          return label
            ? `已把「${titleOf(active.id)}」放进「${label}」栏。`
            : `已把「${titleOf(active.id)}」放在「${titleOf(over.id)}」附近。`;
        },
        onDragCancel: ({ active }) => `已取消，「${titleOf(active.id)}」回到原位。`
      },
      screenReaderInstructions: {
        draggable:
          '按空格拿起这张卡，用方向键移动，再按空格放下，按 Esc 取消。'
      }
    }),
    [liveEl, titleOf]
  );

  return (
    <>
      {/* 显式 id，不能省。
          dnd-kit 的 useUniqueId 在没有 id 时走一个模块级计数器，而且是在 render
          期间自增的；服务端渲染和客户端水合走的次数不同（dev 下 StrictMode 还会
          双调用），生成的 DndDescribedBy-N 对不上，React 直接报 hydration mismatch。
          给了 id 之后那个计数器根本不参与。 */}
      <DndContext
        id={`kanban-${board}`}
        sensors={sensors}
        collisionDetection={collisionDetection}
        // 多栏场景必须 Always。默认只在拖动开始时量一次矩形；卡片跨栏之后
        // 目标栏高度变了，旧矩形会让它下半截「放不进去」。
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        // dnd-kit 默认会在拖动开始时给可滚动祖先补 padding 来补偿滚动条，
        // 而这里的每一栏本身就是滚动容器，补了会肉眼可见地抖。
        autoScroll={{ layoutShiftCompensation: false }}
        accessibility={accessibility}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="kanban-board grid min-h-0 flex-1 grid-flow-col auto-cols-[minmax(260px,1fr)] gap-4 overflow-x-auto lg:grid-cols-3 lg:overflow-x-visible">
          {BOARD_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.key}
              column={column}
              tasks={grouped[column.key] ?? []}
              activeId={activeId}
              dropTarget={dropTarget}
              onOpenTask={setEditing}
              // id: null 是新建的标记 —— TaskDialog 靠它区分新建和编辑。
              onCreateTask={(status) =>
                setEditing({ id: null, status, title: '', description: '' })
              }
            />
          ))}
        </div>

        {/* z-50：导航栏那一条是 z-40，用默认层级的话拖到顶部会被它盖住。 */}
        <DragOverlay
          className="z-50"
          dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}
          style={activeRectWidth.current ? { width: activeRectWidth.current } : undefined}
        >
          {activeTask ? <TaskCard task={activeTask} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* 空着 —— 播报文本由 dnd-kit 的 Accessibility 通过 portal 写进来。
          内容进不进得来取决于挂载顺序，所以这里只负责提供一个稳定的落点。 */}
      <div ref={setLiveEl} data-testid="dnd-live" className="sr-only" />

      <p
        data-testid="board-error"
        aria-live="polite"
        className={`mt-3 min-h-5 text-center text-sm text-destructive ${error ? '' : 'invisible'}`}
      >
        {error ?? ''}
      </p>

      <TaskDialog
        task={editing}
        board={board}
        viewer={viewer}
        onClose={() => setEditing(null)}
        onSaved={(saved, mode) => {
          setRows((prev) =>
            mode === 'create' ? [...prev, saved] : prev.map((r) => (r.id === saved.id ? saved : r))
          );
          setEditing(null);
        }}
        onDeleted={(id) => {
          setRows((prev) => prev.filter((r) => r.id !== id));
          setEditing(null);
        }}
      />
    </>
  );
};

export default KanbanBoard;
