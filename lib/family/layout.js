// 族谱式自动布局。
//
// 没有用 dagre：它是通用 DAG 分层器，而家庭关系图里最有特点的一类边
// ——同层的配偶边——正好是它最不擅长的（同一层之内不允许成边）。
// 自己写反而更短，而且能把「夫妻必须挨着」这件事做成一等约束。

import { KIND, NODE_WIDTH, NODE_HEIGHT, V_GAP } from './model.js';

// 配偶之间比普通邻里更近，两家人之间更远 —— 光靠间距就能看出「这是一对」。
//
// 这两个数不是纯审美。配偶之间那条线要**短到看得出是一对，又长到容得下流动**：
// 卡片各占 200px，线从手柄中心到手柄中心，实际长度 = COUPLE_GAP - 9（手柄半径）。
// 原来是 24，线只有 15px，比一个虚线周期（16px）还短，于是那条婚姻线上
// 永远只能看到一个静止的亮点 —— 直系高亮里最有含义的一条边反而看不出在动。
// 56 让线长约 47px，差不多三个周期，亮点真的在走；同时仍然明显小于
// 两家之间的 112px，夫妻依旧一眼能认出来。
const COUPLE_GAP = 56;
const UNIT_GAP = 112;

// 中位数迭代（barycenter）的轮数。家庭图很小，4 轮足够收敛，
// 轮数固定也让同一份输入永远得到同一份输出。
const ORDER_PASSES = 4;

/**
 * 重排整张图。返回一份新的 nodes 数组（不修改入参）。
 *
 * 只在新建的图、或者用户主动点「自动整理」时调用 —— 平时坐标是用户的，
 * 每次改动都重排会把用户刚拖好的位置抹掉。
 */
export function layoutGraph(graph) {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return nodes;

  const units = buildUnits(nodes, edges);
  const levels = assignLevels(units, edges);
  normalizeLevels(units, levels, nodes);

  const rows = groupByLevel(units, levels);
  orderRows(rows, units, edges, nodes);

  const xs = placeRows(rows, units);

  const positions = new Map();
  for (const unit of units) {
    let x = xs.get(unit.key);
    for (const memberId of unit.members) {
      positions.set(memberId, { x, y: levels.get(unit.key) * (NODE_HEIGHT + V_GAP) });
      x += NODE_WIDTH + COUPLE_GAP;
    }
  }

  return nodes.map((person) => ({ ...person, ...(positions.get(person.id) ?? {}) }));
}

// ---- 单元：把夫妻合并成一个整体 -------------------------------------------

// 夫妻在布局里必须始终相邻，所以先并查集合并成「单元」，
// 之后排序、避让、居中都以单元为单位做，配偶就不会被拆开。
function buildUnits(nodes, edges) {
  const parent = new Map(nodes.map((person) => [person.id, person.id]));

  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== root) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };

  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const edge of edges) {
    if (edge.kind === KIND.SPOUSE) union(edge.source, edge.target);
  }

  const order = [];
  const grouped = new Map();

  for (const person of nodes) {
    const root = find(person.id);
    if (!grouped.has(root)) {
      grouped.set(root, []);
      order.push(root);
    }
    grouped.get(root).push(person.id);
  }

  const unitOf = new Map();
  const units = order.map((root) => {
    const members = grouped.get(root);
    const unit = {
      key: root,
      members,
      width: members.length * NODE_WIDTH + (members.length - 1) * COUPLE_GAP
    };
    for (const id of members) unitOf.set(id, root);
    return unit;
  });

  return attachRelations(units, unitOf, edges);
}

// 把边提升到单元层面，后面分层和排序都在这一层做。
function attachRelations(units, unitOf, edges) {
  const byKey = new Map(units.map((unit) => [unit.key, unit]));

  for (const unit of units) {
    unit.parents = new Set();
    unit.children = new Set();
    unit.index = units.indexOf(unit);
  }

  for (const edge of edges) {
    if (edge.kind !== KIND.PARENT) continue;

    const parentUnit = unitOf.get(edge.source);
    const childUnit = unitOf.get(edge.target);
    // 夫妻内部也可能有一条亲子边（数据脏了才会），自己指向自己会让分层原地打转。
    if (parentUnit === childUnit) continue;

    byKey.get(childUnit).parents.add(parentUnit);
    byKey.get(parentUnit).children.add(childUnit);
  }

  return units;
}

// ---- 分层：代际 ------------------------------------------------------------

/**
 * 用 Kahn 拓扑排序做最长路径分层：亲代永远在子代上一行。
 *
 * 亲子边被用户连成环时，环上的单元永远进不了队列 —— 剩下的那些
 * 统一按「最深的已知单元再往下一行」处理。关键是**有界**：
 * 迭代推进的写法遇到环会一直加下去，最后画布上会出现一万像素的空白。
 */
function assignLevels(units, edges) {
  const levels = new Map();
  const indegree = new Map();
  const byKey = new Map(units.map((unit) => [unit.key, unit]));

  for (const unit of units) indegree.set(unit.key, unit.parents.size);

  const queue = units.filter((unit) => unit.parents.size === 0).map((unit) => unit.key);
  for (const key of queue) levels.set(key, 0);

  let cursor = 0;
  while (cursor < queue.length) {
    const key = queue[cursor++];
    const level = levels.get(key);

    for (const childKey of byKey.get(key).children) {
      levels.set(childKey, Math.max(levels.get(childKey) ?? 0, level + 1));
      indegree.set(childKey, indegree.get(childKey) - 1);
      if (indegree.get(childKey) === 0) queue.push(childKey);
    }
  }

  // 环上的单元。放到已知最深单元的下面一行 —— 位置不完美，
  // 但保证有限、可预测，而且用户一眼就能看出是自己连错了。
  const stuck = units.filter((unit) => !levels.has(unit.key));
  if (stuck.length > 0) {
    const deepest = Math.max(0, ...levels.values());
    for (const unit of stuck) levels.set(unit.key, deepest + 1);
  }

  // 「没有父母记录、但有子女」的人要往下压到孩子头上那一行。
  //
  // 最长路径分层会把所有没有亲代的人当成第一代。对族谱的上半截这是对的，
  // 但对只记了母亲、没记外公外婆的人来说就错了：她会被排到祖辈那一行，
  // 而她的孩子却在下面两行 —— 中间空出一代，看起来像是关系连错了。
  //
  // 这里必须是**赋值**而不是「只往上提」。层号往下增大，所以从第 0 行挪到第 1 行
  // 是往下的方向 —— 写成 `if (desired < current)` 会一次都不生效。
  //
  // 按层号从深到浅处理，子女一定先于父母被处理，所以一次遍历就够。
  // 只动「没有亲代」的单元，因此不会破坏任何一条已经成立的亲子约束：
  // 它们的下方没有约束它们的人，而 desired 又保证了它们仍在子女之上。
  const byDepth = [...units].sort((a, b) => (levels.get(b.key) ?? 0) - (levels.get(a.key) ?? 0));
  for (const unit of byDepth) {
    if (unit.parents.size > 0 || unit.children.size === 0) continue;
    const shallowestChild = Math.min(...[...unit.children].map((key) => levels.get(key) ?? 0));
    levels.set(unit.key, shallowestChild - 1);
  }

  return levels;
}

// 分层结果整体平移，让「我」那一代落在第 0 行。没有标本人时，
// 就让最上面那一代当第 0 行 —— 顶端对齐比底端对齐更符合阅读习惯。
function normalizeLevels(units, levels, nodes) {
  const self = nodes.find((person) => person.isSelf);
  const selfUnit = self ? units.find((unit) => unit.members.includes(self.id)) : null;

  const values = [...levels.values()];
  const anchor = selfUnit ? levels.get(selfUnit.key) : Math.min(...values);

  for (const unit of units) levels.set(unit.key, levels.get(unit.key) - anchor);
}

function groupByLevel(units, levels) {
  const rows = new Map();
  for (const unit of units) {
    const level = levels.get(unit.key);
    if (!rows.has(level)) rows.set(level, []);
    rows.get(level).push(unit);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([level, row]) => ({ level, row }));
}

// ---- 排序：同层谁左谁右 -----------------------------------------------------

/**
 * 按中位数启发式定序：每一轮先按当前横坐标算一遍位置，
 * 再让每个单元靠向它上下两代亲戚的平均位置。
 *
 * 迭代固定轮数而不是「迭代到稳定」，是为了让同一份输入永远得到
 * 同一份输出 —— 否则「自动整理」点两次可能得到两张不同的图。
 */
function orderRows(rows, units, edges, nodes) {
  const self = nodes.find((person) => person.isSelf);
  const seed = new Map();

  // 初值：本人所在单元排最前，其余按插入顺序。之后每轮都会被中位数覆盖，
  // 但它决定了并列时的先后，所以必须确定。
  let counter = 0;
  for (const unit of units) {
    seed.set(unit.key, self && unit.members.includes(self.id) ? -1 : counter++);
  }

  for (const { row } of rows) {
    row.sort((a, b) => seed.get(a.key) - seed.get(b.key));
  }

  for (let pass = 0; pass < ORDER_PASSES; pass += 1) {
    const xs = placeRows(rows, units);

    for (const { row } of rows) {
      const barycenter = new Map();

      for (const unit of row) {
        const neighbours = [...unit.parents, ...unit.children];
        if (neighbours.length === 0) {
          // 和上下两代都没关系（比如独木一个的姻亲），就保持原位不动，
          // 否则每轮都会被推到行首，来回跳。
          barycenter.set(unit.key, xs.get(unit.key) ?? 0);
          continue;
        }
        const total = neighbours.reduce((sum, key) => sum + (xs.get(key) ?? 0), 0);
        barycenter.set(unit.key, total / neighbours.length);
      }

      row.sort((a, b) => {
        const diff = barycenter.get(a.key) - barycenter.get(b.key);
        return diff !== 0 ? diff : seed.get(a.key) - seed.get(b.key);
      });
    }
  }
}

// ---- 落位 ------------------------------------------------------------------

/**
 * 逐行摆放，返回单元左边缘的横坐标。
 *
 * 两趟，方向相反，都以「我」那一行为原点向外推进：
 *  - 往上：让父母落在子女的正上方居中（族谱里长辈居中压着后代）
 *  - 往下：让子女落在父母的正下方居中
 * 两个方向互不干扰，所以父母和子女都能各自居中，不用二选一。
 */
function placeRows(rows, units) {
  const xs = new Map();
  const zeroIndex = rows.findIndex((row) => row.level === 0);
  const origin = zeroIndex === -1 ? 0 : zeroIndex;

  const rowUnits = (index) => rows[index]?.row ?? [];

  const packRow = (row, desired) => {
    let cursor = 0;
    for (const unit of row) {
      const want = desired?.get(unit.key);
      const left = Math.max(want ?? 0, cursor);
      xs.set(unit.key, left);
      cursor = left + unit.width + UNIT_GAP;
    }
  };

  const centerOver = (row, neighboursKey) => {
    const desired = new Map();
    for (const unit of row) {
      const anchors = [...unit[neighboursKey]]
        .map((key) => xs.get(key))
        .filter((value) => value !== undefined);
      if (anchors.length === 0) continue;

      const total = anchors.reduce((sum, value) => sum + value, 0);
      const anchorWidth = [...unit[neighboursKey]].reduce((sum, key) => {
        const other = units.find((candidate) => candidate.key === key);
        return sum + (other ? other.width : NODE_WIDTH);
      }, 0);

      // 参照物（子女或父母）整体的中点，减去自己宽度的一半 = 自己该在的左边缘。
      desired.set(unit.key, total / anchors.length + anchorWidth / anchors.length / 2 - unit.width / 2);
    }
    packRow(row, desired);
  };

  packRow(rowUnits(origin), null);

  // 往上：每个单元对齐到它子女的中线。
  for (let index = origin - 1; index >= 0; index -= 1) {
    centerOver(rowUnits(index), 'children');
  }

  // 往下：每个单元对齐到它父母的中线。
  for (let index = origin + 1; index < rows.length; index += 1) {
    centerOver(rowUnits(index), 'parents');
  }

  return xs;
}
