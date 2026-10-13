'use client';

// 图例里那两条线是**实物**，不是色块：上面那条用的就是画布上直系边同一组
// keyframes 和同一个 stroke-dasharray。图例和实物共用一套 CSS 的好处是
// 改动画时不可能只改一边 —— 也就不可能出现「图例说是这样、画布上却是那样」。
export default function FamilyLegend() {
  return (
    // whitespace-nowrap + shrink-0：窄屏上 Panel 给的空间不够时，
    // flex 会先把文字压成一列一列的竖排（「直/系/亲/属」），
    // 那比缩小字号难看得多。宁可让整条溢出，也不要断字。
    <div className="family-glass flex items-center gap-4 rounded-full px-4 py-2 text-[11px] tracking-wider whitespace-nowrap text-muted-foreground shadow-sm">
      <span className="flex shrink-0 items-center gap-2">
        <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true" className="shrink-0 overflow-visible">
          {/* 底下这层淡光晕和边上的 glow 是同一个手法，只是缩小了 */}
          <line
            x1="2" y1="5" x2="28" y2="5"
            stroke="var(--brand-accent)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.18"
          />
          <line
            className="family-legend__sample"
            x1="2" y1="5" x2="28" y2="5"
            stroke="var(--brand-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-foreground/80">直系亲属</span>
      </span>

      <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />

      <span className="flex shrink-0 items-center gap-2">
        <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true" className="shrink-0">
          <line
            x1="2" y1="5" x2="28" y2="5"
            stroke="color-mix(in oklab, var(--muted-foreground) 55%, transparent)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        旁系亲属
      </span>
    </div>
  );
}
