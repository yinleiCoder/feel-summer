// 看板三栏各自的底色，真栏和骨架屏共用一份 —— 两份各写一遍的话，
// 加载完成的那一刻颜色会跳一下，而骨架屏存在的全部意义就是别跳。
//
// 类名必须是完整的静态字面量，不能写成 `bg-column-${key}`：Tailwind 靠扫源码里的
// 字符串生成类，拼出来的名字它看不见，样式会整条静悄悄地丢（不报错，就是没效果）。
//
// 颜色定义在 app/globals.css 的 --column-* 里，浅色和深色各一套。

const TINT = {
  todo: 'bg-column-todo',
  doing: 'bg-column-doing',
  done: 'bg-column-done'
};

const EDGE = {
  todo: 'border-column-todo-edge',
  doing: 'border-column-doing-edge',
  done: 'border-column-done-edge'
};

export const columnTint = (status) => TINT[status] ?? 'bg-muted/40';

export const columnEdge = (status) => EDGE[status] ?? 'border-border/60';
