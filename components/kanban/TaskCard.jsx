'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 卡片既要能拖，又要能点开弹窗 —— 两者的分界在传感器那边：
// MouseSensor 要位移 6px 才算拖动，所以「点一下」仍然是 click。
const TaskCard = ({ task, onOpen, overlay = false }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'card', status: task.status }
  });

  // 拖动中的源卡片**必须留在原地**，只是变淡。
  //
  // 条件卸载（{!isDragging && <TaskCard/>}）会让这一栏的高度塌掉，
  // dnd-kit 缓存的矩形随之失效，列表会肉眼可见地跳一下；
  // display:none 同理（等于从布局里拿掉），visibility:hidden 则读起来像个窟窿。
  // 变淡 + DragOverlay 里一份不透明的副本，是唯一不会打架的做法。
  const style = overlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition };

  const body = (
    <>
      <p className="text-sm leading-snug break-words">{task.title}</p>
      {task.description ? (
        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {task.description}
        </p>
      ) : null}
    </>
  );

  if (overlay) {
    return (
      // 这份副本是「已经拿起来了」唯一看得见的证据，所以给它一个稳定的钩子。
      // 它不带 data-testid="task-card" —— 那样会让「数一数这一栏有几张卡」的
      // 断言在拖动过程中多数出一张。
      <div
        data-testid="drag-overlay"
        className="cursor-grabbing rounded-lg border border-border bg-card p-3 shadow-lg"
      >
        {body}
      </div>
    );
  }

  return (
    <li
      ref={setNodeRef}
      data-testid="task-card"
      data-task-id={task.id}
      data-status={task.status}
      style={style}
      // py-1 不是留白，是拖动时的命中区：这一栏的 ul 不再用 gap，
      // 每张卡上下各多占 4px，卡片之间那 8px 缝隙才不是「够不到的空白」。
      // 缝隙够不到的话，指针一进去落点就会掉到栏尾，看起来像在乱跳。
      // 视觉样式因此挪到内层 div —— padding 在边框以内，留在 li 上卡片会变胖。
      className={`cursor-grab touch-manipulation py-1 ${isDragging ? 'opacity-30' : ''}`}
      // attributes 里含 role="button" / tabIndex，listeners 是键盘与指针的处理器。
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(task)}
    >
      <div className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20">
        {body}
      </div>
    </li>
  );
};

export default TaskCard;
