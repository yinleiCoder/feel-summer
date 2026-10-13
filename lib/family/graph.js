// 图上的邻接查询。全部是纯函数，入参是 { nodes, edges }，不做缓存 ——
// 一张家庭关系图撑死几十个人，重建索引比维护缓存失效便宜得多，也不会出错。

import { KIND } from './model.js';

/**
 * 把边表转成几个 Map，之后所有遍历都只走这里。
 *
 * 亲子边是有向的（source 是亲代），配偶和兄弟姐妹是无向的 ——
 * 所以后两者两个方向都要登记，否则从「妻子」那一侧就查不到「丈夫」。
 */
export function createIndex(edges) {
  const parentsOf = new Map();
  const childrenOf = new Map();
  const spousesOf = new Map();
  const explicitSiblings = new Map();

  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };

  for (const edge of edges) {
    if (edge.kind === KIND.PARENT) {
      push(parentsOf, edge.target, edge.source);
      push(childrenOf, edge.source, edge.target);
    } else if (edge.kind === KIND.SPOUSE) {
      push(spousesOf, edge.source, edge.target);
      push(spousesOf, edge.target, edge.source);
    } else if (edge.kind === KIND.SIBLING) {
      push(explicitSiblings, edge.source, edge.target);
      push(explicitSiblings, edge.target, edge.source);
    }
  }

  return { parentsOf, childrenOf, spousesOf, explicitSiblings };
}

const members = (map, id) => map.get(id) ?? new Set();

export const parentsOf = (index, id) => members(index.parentsOf, id);
export const childrenOf = (index, id) => members(index.childrenOf, id);
export const spousesOf = (index, id) => members(index.spousesOf, id);

/**
 * 兄弟姐妹＝共用一个亲代的其他人，再加上手动连的兄弟边。
 *
 * 「共父母」是推出来的而不是存出来的：存一份兄弟姐妹关系，
 * 就等于把同一件事记了两遍，删掉父亲之后那份记录就开始说谎。
 */
export function siblingsOf(index, id) {
  const result = new Set(members(index.explicitSiblings, id));
  for (const parent of parentsOf(index, id)) {
    for (const child of childrenOf(index, parent)) {
      if (child !== id) result.add(child);
    }
  }
  result.delete(id);
  return result;
}

// ---- 遍历 ----------------------------------------------------------------

// 两处遍历都必须带 visited：亲子边是用户随手连的，完全可以连成环
// （把爷爷连成孙子的儿子），一旦成环，不带 visited 的递归会直接爆栈。

function walk(index, startId, step) {
  const seen = new Set();
  const queue = [...step(index, startId)];

  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id) || id === startId) continue;
    seen.add(id);
    for (const next of step(index, id)) {
      if (!seen.has(next)) queue.push(next);
    }
  }

  return seen;
}

/** 全部祖先（父母、祖父母、外祖父母…）。 */
export const ancestorsOf = (index, id) => walk(index, id, parentsOf);

/** 全部后代（子女、孙辈…）。 */
export const descendantsOf = (index, id) => walk(index, id, childrenOf);

/**
 * 把「P 是 C 的亲代」这条边加进去，会不会让亲子关系成环？
 *
 * 会成环当且仅当 P 已经在 C 的后代里 —— 也就是说这个人想当自己孙子的儿子。
 * 从 P 的祖先那一侧查更快（往上通常比往下浅）。
 */
export function wouldCreateParentCycle(index, parentId, childId) {
  if (parentId === childId) return true;
  return ancestorsOf(index, parentId).has(childId);
}
