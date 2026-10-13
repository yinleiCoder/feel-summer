// 直系亲属推导 —— 这个功能的招牌（蚂蚁流动线）完全建立在它上面，
// 所以它是全项目最该被单独测的一块。

import { KIND } from './model.js';
import {
  createIndex,
  ancestorsOf,
  descendantsOf,
  spousesOf,
  siblingsOf,
  parentsOf,
  childrenOf
} from './graph.js';

/**
 * 标出哪些人和哪些边属于「我的直系」。
 *
 * 直系 = 本人 + 配偶 + 全部祖先 + 全部后代。这条定义来自民法典的直系血亲，
 * 外加配偶（直系姻亲）—— 用户要看的是一家人，不是一份族谱学作业。
 *
 * 祖辈的配偶、子女的配偶、继父母、姻亲的父母都**不算**：他们既不在
 * 「从本人往上/往下走」的路径上，也不是本人的配偶。
 *
 * @returns {{ linealNodes: Set<string>, linealEdges: Set<string>, hasSelf: boolean }}
 */
export function deriveLineage(graph) {
  const empty = { linealNodes: new Set(), linealEdges: new Set(), hasSelf: false };

  const self = graph.nodes.find((person) => person.isSelf);
  if (!self) return empty;

  const index = createIndex(graph.edges);

  const linealNodes = new Set([self.id]);
  for (const id of ancestorsOf(index, self.id)) linealNodes.add(id);
  for (const id of descendantsOf(index, self.id)) linealNodes.add(id);
  for (const id of spousesOf(index, self.id)) linealNodes.add(id);

  const linealEdges = new Set();
  for (const edge of graph.edges) {
    // 兄弟姐妹一律是旁系 —— 同辈的血亲只可能是兄弟姐妹，而他们不在直系线上。
    if (edge.kind === KIND.SIBLING) continue;

    // 「两端都是直系」这一条就足够了，不需要再判断这条边是不是在主干上：
    // 同一代里的直系节点只可能是配偶（同代血亲只出现在旁系的兄弟姐妹之间），
    // 所以两端同时是直系的亲子边，必然落在「我」的那条上下线上。
    if (linealNodes.has(edge.source) && linealNodes.has(edge.target)) {
      linealEdges.add(edge.id);
    }
  }

  return { linealNodes, linealEdges, hasSelf: true };
}

export const KINSHIP = {
  SELF: 'self',
  ANCESTOR: 'ancestor',
  DESCENDANT: 'descendant',
  SPOUSE: 'spouse',
  SIBLING: 'sibling',
  COLLATERAL: 'collateral',
  UNRELATED: 'unrelated'
};

export const KINSHIP_LABELS = {
  [KINSHIP.SELF]: '本人',
  [KINSHIP.ANCESTOR]: '直系血亲',
  [KINSHIP.DESCENDANT]: '直系血亲',
  [KINSHIP.SPOUSE]: '直系姻亲',
  [KINSHIP.SIBLING]: '旁系血亲',
  [KINSHIP.COLLATERAL]: '旁系血亲',
  [KINSHIP.UNRELATED]: '未连线'
};

/**
 * 某个人和「我」是什么关系。只给选中的那一个人算 —— 面板每次只显示一个。
 *
 * 判定的顺序就是亲疏的顺序：先看是不是本人，再往上/往下，最后才轮到旁系。
 */
export function kinshipTo(graph, nodeId) {
  const self = graph.nodes.find((person) => person.isSelf);
  if (!self) return KINSHIP.UNRELATED;
  if (self.id === nodeId) return KINSHIP.SELF;

  const index = createIndex(graph.edges);

  if (ancestorsOf(index, self.id).has(nodeId)) return KINSHIP.ANCESTOR;
  if (descendantsOf(index, self.id).has(nodeId)) return KINSHIP.DESCENDANT;
  if (spousesOf(index, self.id).has(nodeId)) return KINSHIP.SPOUSE;
  if (siblingsOf(index, self.id).has(nodeId)) return KINSHIP.SIBLING;

  // 其余只要和「我」在同一个连通块里，就算旁系；完全孤立的节点是「未连线」。
  const reachable = new Set([
    self.id,
    ...ancestorsOf(index, self.id),
    ...descendantsOf(index, self.id),
    ...spousesOf(index, self.id),
    ...siblingsOf(index, self.id)
  ]);
  if (reachable.has(nodeId)) return KINSHIP.COLLATERAL;

  // 从「我」出发能走到的所有人才算亲戚。用一次广度遍历覆盖剩下的情况
  // （比如「我」的侄子的配偶、舅舅的岳父）。
  const stack = [...reachable];
  const seen = new Set(reachable);
  while (stack.length > 0) {
    const id = stack.pop();
    const neighbours = [
      ...parentsOf(index, id),
      ...childrenOf(index, id),
      ...spousesOf(index, id),
      ...siblingsOf(index, id)
    ];
    for (const neighbour of neighbours) {
      if (seen.has(neighbour)) continue;
      seen.add(neighbour);
      stack.push(neighbour);
    }
  }

  return seen.has(nodeId) ? KINSHIP.COLLATERAL : KINSHIP.UNRELATED;
}
