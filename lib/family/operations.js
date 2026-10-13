// 对关系图的每一次修改。
//
// 全部是 (graph, ...) => graph 的纯函数，并且**每个会破坏结构完整性的操作
// 都先校验**。校验放在这里而不是放在按钮的 disabled 上，是因为同一条约束
// 有好几个入口（节点工具栏、属性面板、画布拖拽），只在一个入口挡是挡不住的。

import {
  KIND,
  RELATIVE,
  NODE_WIDTH,
  NODE_HEIGHT,
  H_GAP,
  V_GAP,
  createPerson,
  createRelation,
  defaultRelation,
  newPersonId,
  newRelationId
} from './model.js';
import { createIndex, parentsOf, childrenOf, spousesOf, wouldCreateParentCycle, ancestorsOf } from './graph.js';

const ROW_PITCH = NODE_HEIGHT + V_GAP;

const overlaps = (a, b) =>
  a.x < b.x + NODE_WIDTH &&
  a.x + NODE_WIDTH > b.x &&
  a.y < b.y + NODE_HEIGHT &&
  a.y + NODE_HEIGHT > b.y;

/**
 * 从期望位置开始找一块空地。
 *
 * 按「先往右、右满了往下换一行」的顺序试，全部覆盖不到时也不返回 null ——
 * 返回一个偏离的位置总好过让新节点叠在别人身上，用户看得见、拖一下就好了。
 */
function findFreeSpot(occupied, desired) {
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const spot = { x: desired.x + col * (NODE_WIDTH + H_GAP), y: desired.y + row * ROW_PITCH };
      if (!occupied.some((rect) => overlaps(rect, spot))) return spot;
    }
  }
  return { x: desired.x + (NODE_WIDTH + H_GAP) * 6, y: desired.y };
}

const occupiedRects = (graph, excludeId) =>
  graph.nodes.filter((person) => person.id !== excludeId).map((person) => ({ x: person.x, y: person.y }));

// ---- 校验 ------------------------------------------------------------------

/**
 * 这条关系能不能建。返回一句给用户看的话，或者 null 表示可以。
 *
 * 每条规则都对应一种「画出来之后就再也解释不清」的图：
 * 自己是自己的父亲、爷爷是孙子的儿子、同一个人有两桩一模一样的婚姻。
 */
export function validateRelation(graph, source, target, kind) {
  if (!source || !target) return '连接不完整。';
  if (source === target) return '不能连到自己身上。';

  const ids = new Set(graph.nodes.map((person) => person.id));
  if (!ids.has(source) || !ids.has(target)) return '连接涉及不存在的人。';

  const index = createIndex(graph.edges);

  const duplicate = graph.edges.some((edge) => {
    if (edge.kind !== kind) return false;
    // 亲子有方向，配偶和兄弟姐妹没有 —— 去重的口径必须和存的口径一致。
    return kind === KIND.PARENT
      ? edge.source === source && edge.target === target
      : (edge.source === source && edge.target === target) ||
        (edge.source === target && edge.target === source);
  });
  if (duplicate) return '这两个人之间已经有这条关系了。';

  if (kind === KIND.PARENT) {
    if (wouldCreateParentCycle(index, source, target)) {
      return '这样会让亲子关系成环 —— 一个人不能是自己的祖先。';
    }
    if (spousesOf(index, source).has(target)) return '配偶之间不能再连亲子关系。';
    return null;
  }

  if (kind === KIND.SPOUSE) {
    if (ancestorsOf(index, source).has(target) || ancestorsOf(index, target).has(source)) {
      return '直系血亲之间不能连成配偶。';
    }
    return null;
  }

  if (kind === KIND.SIBLING) {
    if (parentsOf(index, source).has(target) || childrenOf(index, source).has(target)) {
      return '父母和子女之间是亲子关系，不是兄弟姐妹。';
    }
    if (parentsOf(index, target).has(source) || childrenOf(index, target).has(source)) {
      return '父母和子女之间是亲子关系，不是兄弟姐妹。';
    }
    return null;
  }

  return '未知的关系类型。';
}

// ---- 图的修改 ---------------------------------------------------------------

export function addPerson(graph, { name = '', isSelf = false, position = null } = {}) {
  const id = newPersonId();

  // 已经有「我」了就不能再加一个 —— normalizeGraph 会在读入时兜底，
  // 但让它在写入时就立不住，比读的时候悄悄丢掉一个更诚实。
  const self = isSelf && !graph.nodes.some((person) => person.isSelf);

  const person = createPerson({
    id,
    name,
    isSelf: self,
    relation: self ? '本人' : '',
    ...(position ?? findFreeSpot(occupiedRects(graph), { x: 0, y: 0 }))
  });

  return { graph: { ...graph, nodes: [...graph.nodes, person] }, id };
}

/**
 * 添加一个亲戚。返回新图、新人的 id、以及新关系（用于选中/提示）。
 *
 * 位置按关系方向摆：父母在上、子女在下、配偶贴右边 ——
 * 用户点一下就能看到新人在「该在的地方」，不需要自己拖。
 */
export function addRelative(graph, anchorId, relative, { name = '' } = {}) {
  const anchor = graph.nodes.find((person) => person.id === anchorId);
  if (!anchor) return { graph, id: null, error: '找不到这个人。' };

  const id = newPersonId();
  const gender = 'unknown';

  let edge;
  let desired;

  if (relative === RELATIVE.PARENT) {
    edge = createRelation(id, anchorId, KIND.PARENT);
    desired = { x: anchor.x, y: anchor.y - ROW_PITCH };
  } else if (relative === RELATIVE.CHILD) {
    edge = createRelation(anchorId, id, KIND.PARENT);
    desired = { x: anchor.x, y: anchor.y + ROW_PITCH };
  } else if (relative === RELATIVE.SPOUSE) {
    edge = createRelation(anchorId, id, KIND.SPOUSE);
    desired = { x: anchor.x + NODE_WIDTH + 24, y: anchor.y };
  } else if (relative === RELATIVE.SIBLING) {
    edge = createRelation(anchorId, id, KIND.SIBLING);
    desired = { x: anchor.x + NODE_WIDTH + H_GAP, y: anchor.y };
  } else {
    return { graph, id: null, error: '未知的亲属类型。' };
  }

  const person = createPerson({
    id,
    name,
    gender,
    // 称谓按关系和性别给个初值，省掉最常见的打字；用户可以改成任何叫法。
    relation: defaultRelation(
      relative === RELATIVE.CHILD ? KIND.PARENT : relative,
      gender,
      relative === RELATIVE.CHILD
    ),
    ...findFreeSpot(occupiedRects(graph), desired)
  });

  return {
    graph: { ...graph, nodes: [...graph.nodes, person], edges: [...graph.edges, edge] },
    id,
    relationId: edge.id
  };
}

export function updatePerson(graph, id, patch) {
  return {
    ...graph,
    nodes: graph.nodes.map((person) => (person.id === id ? { ...person, ...patch } : person))
  };
}

/** 删人必须连带删边 —— 留下指向空气的边，React Flow 会画出一条没有终点的线。 */
export function deletePerson(graph, id) {
  const target = graph.nodes.find((person) => person.id === id);
  if (!target || target.isSelf) return graph;

  return {
    ...graph,
    nodes: graph.nodes.filter((person) => person.id !== id),
    edges: graph.edges.filter((edge) => edge.source !== id && edge.target !== id)
  };
}

export function setSelf(graph, id) {
  if (!graph.nodes.some((person) => person.id === id)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((person) => ({ ...person, isSelf: person.id === id }))
  };
}

export function updateRelation(graph, id, { kind }) {
  const relation = graph.edges.find((edge) => edge.id === id);
  if (!relation || relation.kind === kind) return { graph };

  // 改关系类型等于新建一条 —— 必须走同一套校验，否则「改成亲子」
  // 就成了绕过成环检测的后门。
  const error = validateRelation(
    { ...graph, edges: graph.edges.filter((edge) => edge.id !== id) },
    relation.source,
    relation.target,
    kind
  );
  if (error) return { graph, error };

  return {
    graph: {
      ...graph,
      edges: graph.edges.map((edge) => (edge.id === id ? { ...edge, kind } : edge))
    }
  };
}

export function deleteRelation(graph, id) {
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== id) };
}

/** 画布拖拽落成的关系。 */
export function connect(graph, source, target, kind, relationId = newRelationId()) {
  const error = validateRelation(graph, source, target, kind);
  if (error) return { graph, error };

  return {
    graph: { ...graph, edges: [...graph.edges, { id: relationId, source, target, kind }] }
  };
}

/**
 * 把 React Flow 抛回来的变更落到图上。
 *
 * 只认 position 和 remove 两种：选中状态是这个编辑器自己的 state，
 * 不往会被序列化的那份数据里掺。删节点时连带删掉挂在它上面的边。
 */
export function applyFlowChanges(graph, nodeChanges, edgeChanges) {
  const removedNodes = new Set();
  const positions = new Map();

  for (const change of nodeChanges ?? []) {
    if (change.type === 'remove') removedNodes.add(change.id);
    else if (change.type === 'position' && change.position) positions.set(change.id, change.position);
  }

  const removedEdges = new Set();
  for (const change of edgeChanges ?? []) {
    if (change.type === 'remove') removedEdges.add(change.id);
  }

  if (removedNodes.size === 0 && positions.size === 0 && removedEdges.size === 0) return graph;

  // 「我」不能被键盘删掉：deletable:false 已经在 React Flow 那侧拦了一道，
  // 这里再拦一道，因为这份数据也可能来自别的地方。
  for (const id of removedNodes) {
    if (graph.nodes.find((person) => person.id === id)?.isSelf) removedNodes.delete(id);
  }

  const nodes = graph.nodes
    .filter((person) => !removedNodes.has(person.id))
    .map((person) => (positions.has(person.id) ? { ...person, ...positions.get(person.id) } : person));

  const edges = graph.edges.filter(
    (edge) =>
      !removedEdges.has(edge.id) &&
      !removedNodes.has(edge.source) &&
      !removedNodes.has(edge.target)
  );

  return { ...graph, nodes, edges };
}
