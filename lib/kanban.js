// 看板的数据层：列定义、查询、以及「拖动落点 -> 服务端下标」的换算。
//
// 和 lib/appointments.js 扮演同一个角色：把散落在组件里的规则收成一处，
// 服务端页面和客户端拖拽读的是同一份，两边不可能对「第几栏、第几位」产生分歧。

// creatable 只给「待制作」。
//
// 任务只能从这一栏诞生，另外两栏是流转的去处 —— 一张卡凭空出现在「已完成」里，
// 在真实流程里是没有意义的。规则写在这里而不是组件里，因为它属于业务流程，
// 不属于某个按钮：界面和测试读的是同一份，不会各自漂移。
export const BOARD_COLUMNS = [
  { key: 'todo', label: '待制作', creatable: true },
  { key: 'doing', label: '制作中' },
  { key: 'done', label: '已完成' }
];

export const COLUMN_KEYS = BOARD_COLUMNS.map((c) => c.key);

export const COLUMN_PREFIX = 'col:';

export const columnId = (status) => `${COLUMN_PREFIX}${status}`;

export const isColumnId = (id) => typeof id === 'string' && id.startsWith(COLUMN_PREFIX);

export const statusFromColumnId = (id) => String(id).slice(COLUMN_PREFIX.length);

export const TASK_COLUMNS = 'id,board,status,position,title,description,created_by,created_at,updated_at';

/** 取整块板子。看得见什么由 RLS 决定，不在这里过滤。 */
export async function fetchBoard(supabase, board) {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('board', board)
    .order('position', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** 平坦的行数组 -> 每栏一个有序数组。列的顺序固定按 BOARD_COLUMNS。 */
export const groupByStatus = (rows) =>
  BOARD_COLUMNS.reduce((acc, column) => {
    acc[column.key] = rows
      .filter((row) => row.status === column.key)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    return acc;
  }, {});

/** 摊平回一维数组，顺序固定（栏序 -> 栏内序）。乐观更新后的写回用。 */
export const flattenBoard = (grouped) =>
  BOARD_COLUMNS.flatMap((column) => grouped[column.key] ?? []);

/**
 * 纯函数版的「移动」：不碰网络，只算出新的一维数组。
 *
 * 索引是**摘掉自己之后**的下标，和服务端 move_task 的 p_index 语义完全一致 ——
 * 两边对不上的话，松手时看到的顺序和落库后的顺序会差一格。
 */
export function applyMove(rows, taskId, toStatus, toIndex) {
  const moving = rows.find((row) => row.id === taskId);
  if (!moving) return rows;

  const grouped = groupByStatus(rows);

  // 先把自己从原来那一栏摘干净。
  //
  // 少了这一步，「同栏拖动」会在原地多留一张（目标栏本来就含自己，再插一次就成两张），
  // 「跨栏拖动」会两栏各出现一张 —— 两种都是刷新之后才消失，最难查的那类 bug。
  for (const key of Object.keys(grouped)) {
    grouped[key] = grouped[key].filter((row) => row.id !== taskId);
  }

  const target = grouped[toStatus] ?? [];
  const index = Math.max(0, Math.min(toIndex, target.length));

  grouped[toStatus] = [
    ...target.slice(0, index),
    { ...moving, status: toStatus },
    ...target.slice(index)
  ];

  // 每栏重新压紧成 0..n-1，和服务端 move_task 的稠密整数保持一致。
  // 不一致的话，刷新前和刷新后的顺序会看起来不一样。
  return BOARD_COLUMNS.flatMap((column) =>
    (grouped[column.key] ?? []).map((row, i) => ({ ...row, position: i }))
  );
}

/**
 * 把 dnd-kit 报告的目标解析成「服务端下标」。
 *
 * 三件事都在这一个函数里，因为它们是同一件事的三个分支：
 *   · 落在某张卡上 -> 那张卡在当前栏里的下标（摘掉被拖的那张之后）
 *   · 落在栏的空白处 -> 栏尾
 *   · 落在栏外 -> null（不移动）
 */
export function resolveDropTarget(rows, activeId, over) {
  if (!over) return null;

  const overId = String(over.id);
  const active = rows.find((row) => row.id === activeId);
  if (!active) return null;

  // 落在栏本身 —— 指针在卡片之外的空白处时走这里，也是唯一能落进空栏的路径。
  // 它的含义是「栏尾」，不是「栏首」：一栏的空白几乎总是出现在最后一张之下，
  // 落点跟着落到最上面去的话，用户会觉得指针根本没被理会。
  if (isColumnId(overId)) {
    const status = statusFromColumnId(overId);
    const rest = rows.filter((row) => row.status === status && row.id !== activeId);
    return { status, index: rest.length };
  }

  const overTask = rows.find((row) => row.id === overId);
  if (!overTask) return null;

  // 用 groupByStatus 取这一栏，而不是直接 filter(rows)：排序规则只能有一份，
  // 否则这里算出来的下标和界面上看到的顺序会对不上。
  const column = groupByStatus(rows)[overTask.status] ?? [];
  const overIndex = column.findIndex((row) => row.id === overTask.id);
  if (overIndex === -1) return null;

  // p_index 是「摘掉自己之后」的下标（move_task 的语义，也是 indicatorSlot 画线
  // 时假设的坐标系）。三种情形下它恰好都等于被悬停那张在**整栏**里的下标：
  //
  //   跨栏        [A,B] + C 悬在 B 上 -> 摘掉 C 后仍是 [A,B]，插入点 1 = B 的下标
  //   同栏往下    [A,B,C] 拖 A 到 C  -> 结果是 [B,C,A]，摘掉 A 后是 [B,C]，插入点 2 = C 的下标
  //   同栏往上    [A,B,C] 拖 C 到 A  -> 结果是 [C,A,B]，摘掉 C 后是 [A,B]，插入点 0 = A 的下标
  //
  // 也就是 dnd-kit 的 arrayMove 语义：卡片是和被悬停那张「换位」，不是单纯插到它前面。
  // 直接写 overIndex，不需要按方向加减 —— 减了再加只会互相抵消。
  return { status: overTask.status, index: overIndex };
}

/**
 * 「服务端下标」-> 「渲染槽位」。
 *
 * 拖动过程中被拖的那张还留在原处，所以同栏内往下拖时，落点线要往后挪一格 ——
 * 否则线会画在卡片自己的位置上，看起来像「落不进去」。
 * 跨栏时没有这个问题（被拖的那张不在目标栏里），槽位就是下标。
 */
export function indicatorSlot(columnRows, activeId, target) {
  if (!target) return null;
  const activeIndex = columnRows.findIndex((row) => row.id === activeId);
  if (activeIndex === -1) return target.index;
  return target.index + (activeIndex < target.index ? 1 : 0);
}

/**
 * 看板 key。默认 'main'；测试用 ?board=e2e 拿一块自己的空板子，
 * 免得测试去重排站长真实栏里的卡片顺序。
 */
export const normalizeBoardKey = (raw) => {
  const value = String(raw ?? '').trim();
  return /^[a-z0-9_-]{1,40}$/i.test(value) ? value : 'main';
};
