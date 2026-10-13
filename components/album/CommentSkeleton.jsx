import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

// 留言区的占位。
//
// 关键不是「有个灰条」，而是**形状要和真实内容对得上**：一个圆形 + 两三行长短不一的
// 文字。用统一宽度的长条拼出来的话，内容一到位整块会重排，那种跳动比多等 200ms 更难受。
//
// 底色走主题变量。react-loading-skeleton 默认是浅灰，在深色底上会亮得刺眼；
// 传 var(--muted) / var(--accent) 之后它跟着主题切换，也和其他骨架屏（animate-pulse
// 那些）是同一套颜色。
const SkeletonThemeProps = {
  baseColor: 'var(--muted)',
  highlightColor: 'var(--accent)',
  enableAnimation: true
};

// 每条留言的形状。行宽刻意不一致 —— 真实留言不会每行都正好一样长。
const WIDTHS = ['38%', '32%', '41%'];

const CommentSkeleton = ({ count = 3 }) => (
  <section aria-hidden="true">
    <div className="mb-5 flex items-baseline gap-3">
      <Skeleton width={56} height={12} {...SkeletonThemeProps} />
    </div>

    <div className="flex flex-col gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton circle width={36} height={36} {...SkeletonThemeProps} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton width={WIDTHS[i % WIDTHS.length]} height={12} {...SkeletonThemeProps} />
            <Skeleton count={2} height={12} {...SkeletonThemeProps} />
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default CommentSkeleton;
