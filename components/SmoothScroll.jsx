'use client';

import { ReactLenis } from 'lenis/react';

// Lives in a client component on purpose: Lenis' `prevent` option is a function, and
// functions cannot cross the server -> client boundary in the RSC payload.
// `root` makes Lenis scroll the window itself and renders children with no wrapper,
// so the layout's flex structure is unchanged.
export default function SmoothScroll({ children }) {
  return (
    <ReactLenis
      root
      options={{
        // Lower lerp = the page eases toward the wheel target more slowly.
        lerp: 0.09,
        // Lenis never inspects event.defaultPrevented, so without this it would scroll
        // the page underneath the carousel while the carousel steps through photos.
        //
        // 看板同理，而且更需要：拖动时把页面一起滚起来，落点就对不准了。
        // closest 而不是 classList —— 事件目标是卡片或栏内的元素，
        // 需要一路上溯才能碰到 .kanban-board。栏内部另外还挂了 data-lenis-prevent。
        prevent: node =>
          node?.classList?.contains('flex-carousel') || Boolean(node?.closest?.('.kanban-board'))
      }}
    >
      {children}
    </ReactLenis>
  );
}
