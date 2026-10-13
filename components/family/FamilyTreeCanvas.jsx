'use client';

import { useCallback } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow
} from '@xyflow/react';

// 顺序有讲究：先库、后自己。Next 的 CSS 顺序就是 import 顺序，
// 反过来的话 family-canvas.css 里那些 --xy-* 覆盖会被库的默认值压住。
import '@xyflow/react/dist/style.css';
import './family-canvas.css';

import FamilyEdge from './FamilyEdge';
import FamilyLegend from './FamilyLegend';
import PersonNode from './PersonNode';

// 这两个对象必须是模块级常量。写进组件体会每渲染一次换一份新引用，
// React Flow 会把「类型变了」当成重建信号 —— 文档里点名的无限重渲染就是这么来的。
const nodeTypes = { person: PersonNode };
const edgeTypes = { family: FamilyEdge };

const defaultEdgeOptions = { type: 'family' };

const fitViewOptions = { padding: 0.28, maxZoom: 1 };

const connectionLineStyle = {
  stroke: 'var(--brand-accent)',
  strokeWidth: 2,
  strokeDasharray: '4 4'
};

// 小地图按下标区分三类人。这里用 var() 而不是取计算值：SVG 的 fill
// 表现属性本身就走 CSS 解析，主题切换时能跟着变，不用重渲染整块画布。
const minimapNodeColor = (node) =>
  node.data.lineal ? 'var(--brand-accent)' : 'var(--border)';

function FamilyTreeCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onSelect,
  onClearSelection,
  onNodeDragStart,
  children
}) {
  const handleNodeClick = useCallback(
    (_event, node) => onSelect({ type: 'person', id: node.id }),
    [onSelect]
  );

  const handleEdgeClick = useCallback(
    (_event, edge) => onSelect({ type: 'relation', id: edge.id }),
    [onSelect]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={onClearSelection}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      isValidConnection={isValidConnection}
      // loose：手柄不再分进出，任意两个手柄都能连。一个节点四个方向各一个手柄
      // 就够用了 —— 关系的语义由工具栏上选中的「连线模式」决定，不由方向决定。
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={['Delete', 'Backspace']}
      minZoom={0.2}
      maxZoom={1.8}
      fitView
      fitViewOptions={fitViewOptions}
      connectionLineStyle={connectionLineStyle}
      // 框选要按住 Shift，否则左键拖空白处是平移 —— 编辑一张图时平移比框选用得多。
      selectionOnDrag={false}
      panOnDrag
      onNodeDragStart={onNodeDragStart}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
      {/* 不传 maskColor：那个 prop 会写成 --xy-minimap-mask-background-color-props，
          覆盖优先级最高，CSS 里配好的颜色就没机会生效了。遮罩和底色的主题化
          统一放在 family-canvas.css，一处改完就是改完。 */}
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={minimapNodeColor}
        nodeStrokeWidth={0}
        // 尺寸和边框写在 family-canvas.css 里，而不是在这里堆一串 !important：
        // MiniMap 自带 .react-flow__minimap 的定位样式，用后代选择器压过去
        // 比逐条提权好读，也不用跟 Tailwind 的 important 语法较劲。
        className="family-minimap"
      />
      <Panel position="top-center">
        <FamilyLegend />
      </Panel>
      {children}
    </ReactFlow>
  );
}

export default FamilyTreeCanvas;
