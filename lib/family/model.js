// 家庭关系图的数据形状与常量。
//
// 这一层和 React、React Flow 都没有关系：它只认「一份带 version 的 JSON 文档」。
// 之所以要这么切，是因为这个功能里真正会写错的地方只有两处 —— 直系推导和自动布局 ——
// 把它们做成纯函数就能先在 node 里跑断言，不用开浏览器。

export const GRAPH_VERSION = 1;

// 画布尺寸。布局算法和节点组件共用这几个数，所以节点宽高不能只写在 JSX 里 ——
// 否则改一次样式，自动布局就要跟着瞎一次。
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 96;
export const H_GAP = 56;
export const V_GAP = 108;

// 配偶和兄弟姐妹是无向的，亲子是有向的（source 是亲代，target 是子代）。
export const KIND = {
  PARENT: 'parent',
  SPOUSE: 'spouse',
  SIBLING: 'sibling'
};

export const KIND_LABELS = {
  [KIND.PARENT]: '亲子',
  [KIND.SPOUSE]: '配偶',
  [KIND.SIBLING]: '兄弟姐妹'
};

// 「添加一个什么亲戚」和「这是一条什么边」不是一回事：
// 加子女时，新边其实是一条从本人出发的 parent 边。
// 把它单独列出来，免得在动作层到处写 `kind === 'child' ? PARENT : kind`。
export const RELATIVE = {
  PARENT: 'parent',
  SPOUSE: 'spouse',
  CHILD: 'child',
  SIBLING: 'sibling'
};

export const RELATIVE_LABELS = {
  [RELATIVE.PARENT]: '添加父母',
  [RELATIVE.SPOUSE]: '添加配偶',
  [RELATIVE.CHILD]: '添加子女',
  [RELATIVE.SIBLING]: '添加兄弟姐妹'
};

export const GENDERS = ['male', 'female', 'unknown'];

export const GENDER_LABELS = {
  male: '男',
  female: '女',
  unknown: '未填'
};

// 按关系和性别给「称谓」一个默认值。用户随时可以改写成方言叫法
// （「姥姥」而不是「外祖母」）—— 这只是省去打字，不是枚举。
const DEFAULT_RELATIONS = {
  [KIND.PARENT]: { male: '父亲', female: '母亲', unknown: '父母' },
  [KIND.SPOUSE]: { male: '配偶', female: '配偶', unknown: '配偶' },
  [KIND.SIBLING]: { male: '兄弟', female: '姐妹', unknown: '兄弟姐妹' }
};

// 子女这一侧的默认称谓是反着来的：新节点是「子代」而不是「亲代」。
const CHILD_RELATIONS = { male: '儿子', female: '女儿', unknown: '子女' };

export const RELATION_SUGGESTIONS = [
  '本人',
  '父亲',
  '母亲',
  '祖父',
  '祖母',
  '外祖父',
  '外祖母',
  '配偶',
  '儿子',
  '女儿',
  '孙子',
  '孙女',
  '外孙',
  '外孙女',
  '哥哥',
  '弟弟',
  '姐姐',
  '妹妹',
  '伯父',
  '叔叔',
  '姑姑',
  '舅舅',
  '姨妈'
];

export function defaultRelation(kind, gender, isChildSide = false) {
  if (isChildSide) return CHILD_RELATIONS[gender] ?? CHILD_RELATIONS.unknown;
  return DEFAULT_RELATIONS[kind]?.[gender] ?? '';
}

// 用 crypto 而不是递增计数器：两份关系图合并、或者用户在两个标签页里各改各的时，
// 计数器会撞号，随机 id 不会。
function newId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  const rand = uuid ? uuid.replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}

export const newPersonId = () => newId('p');
export const newRelationId = () => newId('e');

export function createPerson(overrides = {}) {
  return {
    id: newPersonId(),
    name: '',
    gender: 'unknown',
    relation: '',
    birth: null,
    death: null,
    avatarUrl: null,
    note: '',
    isSelf: false,
    x: 0,
    y: 0,
    ...overrides
  };
}

export function createRelation(source, target, kind) {
  return { id: newRelationId(), source, target, kind };
}

export function emptyGraph() {
  return { version: GRAPH_VERSION, nodes: [], edges: [] };
}

// ---- 读入侧的净化 ----------------------------------------------------------

const asString = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

// 生卒年只留 "YYYY" 或 "YYYY-MM-DD"，其余一律当没填。
// 存进来的可能是用户手打的一整句话，但渲染时是当日期用的。
const asDate = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(trimmed) ? trimmed : null;
};

const asCoord = (value) => (Number.isFinite(value) ? value : 0);

function normalizePerson(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;

  return {
    id: raw.id,
    name: asString(raw.name).slice(0, 40),
    gender: GENDERS.includes(raw.gender) ? raw.gender : 'unknown',
    relation: asString(raw.relation).slice(0, 20),
    birth: asDate(raw.birth),
    death: asDate(raw.death),
    avatarUrl: asString(raw.avatarUrl) || null,
    note: asString(raw.note).slice(0, 500),
    isSelf: raw.isSelf === true,
    x: asCoord(raw.x),
    y: asCoord(raw.y)
  };
}

// 无向关系的边只保留一个方向。A—B 和 B—A 是同一桩婚姻，
// 不折叠的话直系推导会把配偶数成两个、布局也会把它当成两条边。
const undirectedKey = (kind, a, b) => `${kind}:${[a, b].sort().join('|')}`;

/**
 * 把任意来源的一份数据整理成合法的图。
 *
 * 只修复、不抛错：这份 JSON 存在数据库里、也可能被手改坏，
 * 一个坏字段不该让整页白屏。正常的失败方式是少一个人，
 * 而不是一个人都看不见。
 */
export function normalizeGraph(raw) {
  const graph = emptyGraph();
  if (!raw || typeof raw !== 'object') return graph;

  const seenNodeIds = new Set();
  let selfTaken = false;

  for (const item of Array.isArray(raw.nodes) ? raw.nodes : []) {
    const person = normalizePerson(item);
    if (!person || seenNodeIds.has(person.id)) continue;
    seenNodeIds.add(person.id);

    // 全图只认第一个「我」。两个本人会让直系推导从两个源头出发，
    // 结果是谁也不认识谁 —— 与其画一张错的图，不如只认一个。
    if (person.isSelf) {
      if (selfTaken) person.isSelf = false;
      else selfTaken = true;
    }

    graph.nodes.push(person);
  }

  const seenEdgeIds = new Set();
  const seenPairs = new Set();

  for (const item of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!item || typeof item !== 'object') continue;

    const { source, target } = item;
    const kind = Object.values(KIND).includes(item.kind) ? item.kind : KIND.PARENT;

    // 悬空边（指向已经删掉的人）直接丢掉，否则 React Flow 会画出一条没有终点的线。
    if (!seenNodeIds.has(source) || !seenNodeIds.has(target)) continue;
    if (source === target) continue;

    const pairKey =
      kind === KIND.PARENT ? `${kind}:${source}>${target}` : undirectedKey(kind, source, target);
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    let id = typeof item.id === 'string' && item.id ? item.id : newRelationId();
    while (seenEdgeIds.has(id)) id = newRelationId();
    seenEdgeIds.add(id);

    graph.edges.push({ id, source, target, kind });
  }

  return graph;
}
