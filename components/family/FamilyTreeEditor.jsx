'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MarkerType, ReactFlowProvider, useReactFlow } from '@xyflow/react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { KIND, NODE_WIDTH, NODE_HEIGHT, normalizeGraph } from '@/lib/family/model';
import { deriveLineage } from '@/lib/family/lineage';
import { layoutGraph } from '@/lib/family/layout';
import { saveFamilyTree, fetchFamilyTree } from '@/lib/family/data';
import {
  addPerson,
  addRelative,
  connect,
  deletePerson,
  deleteRelation,
  setSelf,
  updatePerson,
  updateRelation,
  validateRelation
} from '@/lib/family/operations';
import { editorReducer, initialEditorState, isDirty } from '@/lib/family/reducer';
import { FamilyEditorContext } from './editor-context';
import EditorToolbar from './EditorToolbar';
import FamilyEmptyState from './FamilyEmptyState';
import PersonInspector from './PersonInspector';

// 画布必须只在浏览器里渲染，而且这个 dynamic() 只能写在客户端组件里 ——
// 文档原话：「ssr: false is not allowed with next/dynamic in Server Components」。
// 页面是服务端组件，它只 import 这一层；重量级的 React Flow 到这一步才被拆出去。
const FamilyTreeCanvas = dynamic(() => import('./FamilyTreeCanvas'), {
  ssr: false,
  loading: () => <CanvasSkeleton />
});

function CanvasSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-[11px] tracking-[0.3em] text-muted-foreground/80">画布准备中…</span>
    </div>
  );
}

const AUTOSAVE_DELAY = 900;

const edgeMarker = { type: MarkerType.ArrowClosed, width: 14, height: 14 };

/**
 * 从关系类型推出这条边接在节点的哪两个手柄上。
 *
 * 配偶和兄弟姐妹是横向的，具体走左边还是右边要看两个人谁在左 ——
 * 不按实际坐标定的话，用户把妻子拖到丈夫左边之后，线会绕回去穿过卡片。
 *
 * 手柄 id 必须用 -src / -tgt 后缀的那一组：React Flow 画边时按
 * 「节点 id + 手柄 id + 类型」查位置，用错了类型它不会报错，只是**不画**。
 */
function handlesFor(relation, byId) {
  if (relation.kind === KIND.PARENT) return { sourceHandle: 'bottom', targetHandle: 'top' };

  const source = byId.get(relation.source);
  const target = byId.get(relation.target);
  if (!source || !target) return { sourceHandle: 'right-src', targetHandle: 'left-tgt' };

  return source.x <= target.x
    ? { sourceHandle: 'right-src', targetHandle: 'left-tgt' }
    : { sourceHandle: 'left-src', targetHandle: 'right-tgt' };
}

function formatClock(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function FamilyTreeEditor(props) {
  return (
    <ReactFlowProvider>
      <EditorShell {...props} />
    </ReactFlowProvider>
  );
}

function EditorShell({ userId, initialGraph, initialRevision, initialUpdatedAt, displayName, avatarUrl }) {
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [state, dispatch] = useReducer(editorReducer, null, () =>
    initialEditorState(normalizeGraph(initialGraph), initialRevision, initialUpdatedAt)
  );

  const [selection, setSelection] = useState(null);
  const [linkMode, setLinkMode] = useState(KIND.PARENT);
  const [error, setError] = useState(null);
  // 只有刚新建的节点才把光标送进姓名框。用户点选已有节点时不能抢焦点，
  // 否则紧接着按 Delete 会被当成在输入框里删字，节点删不掉。
  const [focusId, setFocusId] = useState(null);
  const wrapperRef = useRef(null);

  const dirty = isDirty(state);
  const lineage = useMemo(() => deriveLineage(state.graph), [state.graph]);

  const mutate = useCallback((mutateFn) => dispatch({ type: 'commit', mutate: mutateFn }), []);

  // ---- 保存 -----------------------------------------------------------------

  // 保存是异步的，而它需要「发起请求那一刻」的图。用 ref 照一份最新状态，
  // 免得回调里闭包到过期的 state。
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const savingRef = useRef(false);

  const runSave = useCallback(async () => {
    if (savingRef.current) return;

    const current = stateRef.current;
    if (current.graph === current.savedGraph) return;

    savingRef.current = true;
    dispatch({ type: 'save:start' });

    let result;
    try {
      result = await saveFamilyTree(createClient(), userId, current.graph, current.revision);
    } catch (err) {
      result = { ok: false, reason: 'error', message: err?.message };
    } finally {
      savingRef.current = false;
    }

    if (result.ok) {
      dispatch({
        type: 'save:ok',
        revision: result.revision,
        updatedAt: result.updatedAt,
        savedGraph: current.graph
      });
    } else if (result.reason === 'conflict') {
      dispatch({ type: 'save:conflict' });
    } else {
      dispatch({ type: 'save:error', message: result.message ?? '保存失败' });
    }
  }, [userId]);

  useEffect(() => {
    if (!dirty || state.saveStatus === 'saving' || state.saveStatus === 'conflict') return undefined;
    const timer = setTimeout(runSave, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [dirty, state.graph, state.saveStatus, runSave]);

  const handleManualSave = useCallback(() => {
    if (stateRef.current.saveStatus === 'conflict') {
      dispatch({ type: 'save:force' });
      return;
    }
    runSave();
  }, [runSave]);

  // 这个页面是开在新标签页里的，用户关标签就是最自然的「退出」动作。
  // 自动保存有 900ms 的窗口，不拦一下会真的丢东西。
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // 选中的东西被删掉之后，面板还停在一个人身上不放会很怪。
  useEffect(() => {
    if (!selection) return;
    const exists =
      selection.type === 'person'
        ? state.graph.nodes.some((person) => person.id === selection.id)
        : state.graph.edges.some((edge) => edge.id === selection.id);
    if (!exists) setSelection(null);
  }, [state.graph, selection]);

  const reloadFromServer = useCallback(async () => {
    const { data } = await fetchFamilyTree(createClient(), userId);
    dispatch({
      type: 'reset',
      graph: normalizeGraph(data?.graph ?? null),
      revision: data?.revision ?? null,
      updatedAt: data?.updated_at ?? null
    });
    setSelection(null);
  }, [userId]);

  // ---- 编辑动作 --------------------------------------------------------------

  // 用户在画布上自己点选时走这里：清掉 focusId，绝不把焦点从画布抢走。
  const handleSelect = useCallback((next) => {
    setFocusId(null);
    setSelection(next);
  }, []);

  const handleAddRelative = useCallback(
    (anchorId, relative) => {
      const result = addRelative(stateRef.current.graph, anchorId, relative);
      if (!result.id) {
        setError(result.error);
        return;
      }
      setError(null);
      mutate(() => result.graph);
      setSelection({ type: 'person', id: result.id });
      setFocusId(result.id);
    },
    [mutate]
  );

  const handleAddPerson = useCallback(() => {
    // 落在画布正中央，而不是坐标系原点 —— 图被平移过之后，
    // 新节点出现在原点等于出现在屏幕外。
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
    });
    const result = addPerson(stateRef.current.graph, {
      position: {
        x: Math.round(center.x - NODE_WIDTH / 2),
        y: Math.round(center.y - NODE_HEIGHT / 2)
      }
    });
    setError(null);
    mutate(() => result.graph);
    setSelection({ type: 'person', id: result.id });
    setFocusId(result.id);
  }, [mutate, screenToFlowPosition]);

  const handleStartSelf = useCallback(() => {
    const result = addPerson(stateRef.current.graph, {
      name: displayName ?? '',
      isSelf: true,
      position: { x: 0, y: 0 }
    });
    // 顺手把资料页的名字和头像带过来 —— 第一个节点本来就不用用户再填一遍。
    const graph = avatarUrl ? updatePerson(result.graph, result.id, { avatarUrl }) : result.graph;
    mutate(() => graph);
    setSelection({ type: 'person', id: result.id });
    setFocusId(result.id);
  }, [avatarUrl, displayName, mutate]);

  const handleUpdatePerson = useCallback(
    (id, patch) => mutate((graph) => updatePerson(graph, id, patch)),
    [mutate]
  );

  const handleDeletePerson = useCallback(
    (id) => {
      mutate((graph) => deletePerson(graph, id));
      setFocusId(null);
      setSelection(null);
    },
    [mutate]
  );

  const handleSetSelf = useCallback(
    (id) => {
      mutate((graph) => setSelf(graph, id));
      setError(null);
    },
    [mutate]
  );

  const handleUpdateRelation = useCallback(
    (id, patch) => {
      const current = stateRef.current.graph;
      if (patch.kind) {
        const error = updateRelation(current, id, patch).error;
        if (error) {
          setError(error);
          return;
        }
      }
      setError(null);
      mutate((graph) => updateRelation(graph, id, patch).graph);
    },
    [mutate]
  );

  const handleDeleteRelation = useCallback(
    (id) => {
      mutate((graph) => deleteRelation(graph, id));
      setSelection(null);
    },
    [mutate]
  );

  const handleConnect = useCallback(
    (connection) => {
      const result = connect(stateRef.current.graph, connection.source, connection.target, linkMode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      mutate(() => result.graph);
    },
    [linkMode, mutate]
  );

  const isValidConnection = useCallback(
    (connection) =>
      validateRelation(stateRef.current.graph, connection.source, connection.target, linkMode) === null,
    [linkMode]
  );

  const handleNodesChange = useCallback(
    (changes) => dispatch({ type: 'flow', nodeChanges: changes, edgeChanges: null }),
    []
  );

  const handleEdgesChange = useCallback(
    (changes) => dispatch({ type: 'flow', nodeChanges: null, edgeChanges: changes }),
    []
  );

  // 拖动开始时打一个历史点，松手后不再补 —— 拖动过程中每个 mousemove
  // 都会产生一次 position 变更，逐帧压栈会让「撤销」退化成退一个像素。
  const handleNodeDragStart = useCallback(() => dispatch({ type: 'snapshot' }), []);

  const handleTidy = useCallback(() => {
    mutate((graph) => ({ ...graph, nodes: layoutGraph(graph) }));
    setTimeout(() => fitView({ padding: 0.28, maxZoom: 1 }), 0);
  }, [fitView, mutate]);

  const handleFitView = useCallback(() => fitView({ padding: 0.28, maxZoom: 1 }), [fitView]);

  // ---- 派生给画布的数据 -------------------------------------------------------

  const flowNodes = useMemo(() => {
    const selectedId = selection?.type === 'person' ? selection.id : null;
    return state.graph.nodes.map((person) => ({
      id: person.id,
      type: 'person',
      position: { x: person.x, y: person.y },
      // 尺寸必须写在 width/height 这两个顶层字段上，写进 style 不算数。
      // React Flow 判定「这个节点有没有尺寸」用的是
      //   node.measured?.width ?? node.width ?? node.initialWidth
      // —— style.width 完全不在这条链上。而小地图的每个节点都在
      // `if (!nodeHasDimensions(node)) return null` 这一行被丢掉，
      // 于是小地图渲染成一个空白方块，还不会有任何报错。
      // 顺带的好处：首帧 fitView 不用等 ResizeObserver 量完。
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // 「我」删不得：直系高亮整套逻辑都挂在这个节点上。
      deletable: !person.isSelf,
      selected: person.id === selectedId,
      data: { person, lineal: lineage.linealNodes.has(person.id) }
    }));
  }, [state.graph.nodes, selection, lineage]);

  const flowEdges = useMemo(() => {
    const selectedId = selection?.type === 'relation' ? selection.id : null;
    const byId = new Map(state.graph.nodes.map((person) => [person.id, person]));

    return state.graph.edges.map((relation) => ({
      id: relation.id,
      type: 'family',
      source: relation.source,
      target: relation.target,
      ...handlesFor(relation, byId),
      // 只有亲子边画箭头：箭头的有无本身就在说明这条边有没有方向。
      markerEnd: relation.kind === KIND.PARENT ? edgeMarker : undefined,
      selected: relation.id === selectedId,
      data: { kind: relation.kind, lineal: lineage.linealEdges.has(relation.id) }
    }));
  }, [state.graph.edges, state.graph.nodes, selection, lineage]);

  const editorApi = useMemo(
    () => ({
      addRelative: handleAddRelative,
      select: handleSelect,
      removePerson: handleDeletePerson
    }),
    [handleAddRelative, handleSelect, handleDeletePerson]
  );

  const isEmpty = state.graph.nodes.length === 0;

  const saveState = {
    status: state.saveStatus,
    at: formatClock(state.savedAt),
    message: state.saveError
  };

  return (
    <FamilyEditorContext.Provider value={editorApi}>
      <div className="flex min-h-0 flex-1 flex-col">
        <EditorToolbar
          linkMode={linkMode}
          onLinkModeChange={setLinkMode}
          onAddPerson={handleAddPerson}
          onTidy={handleTidy}
          onFitView={handleFitView}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          saveState={saveState}
          onSave={handleManualSave}
          dirty={dirty}
          disabled={isEmpty}
        />

        {state.saveStatus === 'conflict' && (
          <div className="flex flex-wrap items-center gap-3 border-b border-destructive/40 bg-destructive/8 px-6 py-2.5">
            <p className="text-xs tracking-wide text-destructive">
              这份关系图在另一个标签页里被改过，直接保存会覆盖掉那边的改动。
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={reloadFromServer}>
                载入那一份
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  dispatch({ type: 'save:force' });
                  runSave();
                }}
              >
                用我的覆盖
              </Button>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* data-lenis-prevent 必须有：根布局的 Lenis 在 window 上劫持滚轮，
              不让路的话在画布上滚轮会去滚页面，而不是缩放画布。
              这个属性是 Lenis 原生支持的，不用去改共享的 SmoothScroll。 */}
          <div ref={wrapperRef} className="family-canvas relative min-h-0 min-w-0 flex-1" data-lenis-prevent>
            <FamilyTreeCanvas
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeDragStart={handleNodeDragStart}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onSelect={handleSelect}
              onClearSelection={() => {
                handleSelect(null);
                setError(null);
              }}
            />

            {isEmpty && <FamilyEmptyState onStart={handleStartSelf} />}
          </div>

          {/* 属性面板是画布的兄弟节点而不是浮层：画布拿到剩下的全部宽度，
              两者永远不会互相遮挡。窄屏（lg 以下）从右栏变成下栏 ——
              同一份 DOM，只换 flex 方向，不渲染第二个面板
              （渲染两份会让 datalist 的 id 和 autoFocus 打架）。 */}
          <aside
            className={cn(
              'shrink-0 overflow-y-auto border-border/60',
              'max-h-[45dvh] border-t',
              'lg:max-h-none lg:w-[320px] lg:border-t-0 lg:border-l',
              // 窄屏上没选中任何东西时整块收起来：手机屏幕本来就只够放两三个节点，
              // 再让一段「请先选中」的说明占掉三分之一高度，画布就没法看了。
              // 桌面上它常驻 —— 那里它是侧栏，不占画布的行。
              !selection && 'hidden lg:block'
            )}
          >
            <PersonInspector
              graph={state.graph}
              selection={selection}
              onUpdatePerson={handleUpdatePerson}
              onDeletePerson={handleDeletePerson}
              onSetSelf={handleSetSelf}
              onUpdateRelation={handleUpdateRelation}
              onDeleteRelation={handleDeleteRelation}
              focusId={focusId}
              error={error}
              disabled={state.saveStatus === 'saving'}
            />
          </aside>
        </div>
      </div>
    </FamilyEditorContext.Provider>
  );
}
