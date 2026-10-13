'use client';

import { createContext, useContext } from 'react';

// 节点和属性面板要能改动整张图（加一个亲戚、删一条边），但它们是由 React Flow
// 渲染的，拿不到 FamilyTreeEditor 里的 state。
//
// 用 context 而不是把这些回调塞进 node.data：data 是会被序列化进数据库的那份
// 数据的一部分，往里放函数就等于把「可存的数据」和「运行时行为」搅在一起 ——
// 之后想给节点加个 memo 比较、或者把 data 直接 stringify 存草稿，都会踩到。
export const FamilyEditorContext = createContext(null);

export function useFamilyEditor() {
  const editor = useContext(FamilyEditorContext);
  if (!editor) {
    throw new Error('useFamilyEditor 只能在 FamilyTreeEditor 内部使用');
  }
  return editor;
}
