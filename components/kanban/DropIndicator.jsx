// 拖动时的落点线。
//
// 只由 onDragOver 驱动，不用 onDragMove —— 后者每帧都触发，会把它刷成抖动的。
//
// 带上 data-status / data-index，是为了让 Playwright 能断言**落在哪一格**，
// 而不只是「屏幕上有一条线」。落错一格是这类交互最常见的 bug，
// 只断言「线存在」的话完全测不出来。
const DropIndicator = ({ status, index }) => (
  <li
    aria-hidden="true"
    // h-0：落点线不占布局高度。占的话它一出现，下面的卡片就被顶下去几个像素，
    // 指针底下换成了另一张卡，落点跟着跳 —— 自己把自己晃成抖动的。
    className="pointer-events-none relative h-0"
  >
    {/* data-testid 挂在线本身，不挂 li：li 高度是 0，
        Playwright 的 toBeVisible 判的是「有没有非空盒子」，于是线明明画出来了
        却报 hidden —— 一条会撒谎的断言比没有断言更糟。挂在线身上，所见即所测。 */}
    <span
      data-testid="drop-indicator"
      data-status={status}
      data-index={index}
      className="absolute -top-px left-0 h-0.5 w-full rounded-full bg-brand"
    />
    <span className="absolute -top-0.5 -left-0.5 size-1.5 rounded-full bg-brand" />
  </li>
);

export default DropIndicator;
