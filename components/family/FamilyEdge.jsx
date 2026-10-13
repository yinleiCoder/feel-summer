'use client';

import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, getStraightPath } from '@xyflow/react';

import { cn } from '@/lib/utils';
import { KIND } from '@/lib/family/model';

// 一条边最多叠三层，从下往上：
//   glow —— 很淡的一圈光晕，只在直系边上出现
//   base —— 定线，保证关掉动画之后关系仍然读得出来
//   ants —— 蚂蚁流动线本体
//
// 直系边和旁系边的差别不是「颜色不同」，而是「层数不同」：
// 旁系边只有 base 一层，安静得像背景；直系边走三层，自己会动。
// 这个对比本身就是信息，不需要再配一个图例去解释颜色。
function FamilyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected
}) {
  const lineal = Boolean(data?.lineal);
  const kind = data?.kind ?? KIND.PARENT;

  // 夫妻是并排的，走直角折线会绕出一个多余的方框；直线才是「同一排的两个人」。
  const [path] =
    kind === KIND.SPOUSE
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          borderRadius: 14
        });

  return (
    <g className={cn('family-edge', lineal && 'is-lineal', selected && 'is-selected')}>
      {lineal && <path className="family-edge__glow" d={path} />}

      <BaseEdge
        id={id}
        path={path}
        className="family-edge__base"
        // 兄弟姐妹和夫妻都是无向的，只有亲子边画箭头 ——
        // 箭头的存在与否本身就在说明这条边有没有方向。
        markerEnd={kind === KIND.PARENT ? markerEnd : undefined}
        // 线很细，命中区域放宽到 24px，否则要点中一条边得瞄半天。
        interactionWidth={24}
      />

      {lineal && <path className="family-edge__ants" d={path} />}
    </g>
  );
}

export default memo(FamilyEdge);
