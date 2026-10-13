// 编辑器的状态机。
//
// 做成 reducer 而不是一堆 useState，是为了让「改图」和「记历史」永远同时发生 ——
// 分成两个 state 的话，早晚会有人写出改了图却忘了压栈的那条分支，
// 而撤销少一步是那种要等到用户按了 Ctrl+Z 才会发现的 bug。
//
// reducer 必须是纯的：这里不碰网络、不碰定时器，保存只是状态；谁去发请求由组件决定。

import { applyFlowChanges } from './operations.js';

export const HISTORY_LIMIT = 30;

export function initialEditorState(graph, revision, updatedAt) {
  return {
    graph,
    past: [],
    future: [],
    // 用引用比较判断「有没有未保存的改动」：图是不可变的，
    // 只要对象换了一个就说明改过。比逐字段 deep-equal 便宜，也不会漏。
    //
    // savedGraph 一开始就指向 graph，即使这一行还没落库也一样 ——
    // 「刚打开、还没动过」不等于「有未保存的改动」。早先这里在没版本号时
    // 置成 null，于是新用户一进页面就触发一次自动保存，而更糟的是：
    // 服务端读取**失败**时客户端也会拿到一份空图，于是那次自动保存
    // 直接把用户已有的关系图覆盖成了空图。**这是真的丢过一次数据。**
    // 现在只有真正改过东西（graph 换过对象）才会写库。
    savedGraph: graph,
    revision,
    savedAt: updatedAt,
    // 'new' = 还没落过库、也没东西可存。它和 'saved' 分开，是为了让状态条
    // 别在一个空关系图上写「已保存」——那是句不准确的话。
    saveStatus: revision === null ? 'new' : 'saved',
    saveError: null
  };
}

const pushPast = (state, graph) => ({
  past: [...state.past, graph].slice(-HISTORY_LIMIT),
  future: []
});

export function editorReducer(state, action) {
  switch (action.type) {
    // 有历史意义的改动：加人、删人、改字段、整理布局。
    case 'commit': {
      const graph = action.mutate(state.graph);
      if (graph === state.graph) return state;
      return { ...state, graph, ...pushPast(state, state.graph), saveError: null };
    }

    // 只在时间线上打一个点，不动图。
    // 拖拽用：拖动过程中每个 mousemove 都会产生一次位移，如果每次都压栈，
    // 撤销一次只会退回一个像素。开始拖的时候打点，松手时图已经是最新的。
    case 'snapshot':
      return { ...state, ...pushPast(state, state.graph) };

    // React Flow 的位置/删除变更。不进历史 —— 历史由 snapshot 负责。
    case 'flow': {
      const graph = applyFlowChanges(state.graph, action.nodeChanges, action.edgeChanges);
      return graph === state.graph ? state : { ...state, graph };
    }

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        graph: previous,
        past: state.past.slice(0, -1),
        future: [state.graph, ...state.future].slice(0, HISTORY_LIMIT)
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        graph: next,
        past: [...state.past, state.graph].slice(-HISTORY_LIMIT),
        future: rest
      };
    }

    // 别处改过之后重新载入：历史全部作废，因为旧快照是另一条时间线上的图。
    case 'reset':
      return initialEditorState(action.graph, action.revision, action.updatedAt);

    case 'save:start':
      return { ...state, saveStatus: 'saving', saveError: null };

    case 'save:ok':
      return {
        ...state,
        revision: action.revision,
        savedAt: action.updatedAt,
        savedGraph: action.savedGraph,
        saveError: null,
        // 请求在飞的这段时间里用户可能又改了几笔 ——
        // 那些改动不在刚存下去的那份里，状态必须退回「未保存」。
        saveStatus: state.graph === action.savedGraph ? 'saved' : 'dirty'
      };

    case 'save:error':
      return { ...state, saveStatus: 'error', saveError: action.message };

    case 'save:conflict':
      return { ...state, saveStatus: 'conflict', saveError: null };

    // 冲突时用户选「用我的覆盖」：把版本号清零，下一次写入走 upsert。
    case 'save:force':
      return { ...state, revision: null, saveStatus: 'dirty' };

    default:
      return state;
  }
}

export const isDirty = (state) => state.graph !== state.savedGraph;
