// 把 Fuse 给出的匹配区间渲染成高亮。
//
// Fuse 的 matches[].indices 是一组 [start, end]（闭区间，按 start 升序）。
// 模糊匹配下区间不会重叠，但可能相邻，所以顺手合并一下 —— 否则「薛之谦」里
// 连着的两段会渲染成两个 <mark>，中间那条缝在视觉上很扎眼。
const mergeIndices = (indices) => {
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const merged = [];

  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

const Highlight = ({ text, indices }) => {
  if (!text) return null;
  if (!indices?.length) return text;

  const parts = [];
  let cursor = 0;

  mergeIndices(indices).forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      // 不是 <mark> 的默认黄底 —— 那在深色站里太跳。用主色低透明度，
      // 和输入框的填充是同一套语言。
      <mark
        key={i}
        className="rounded-[3px] bg-primary/30 px-0.5 text-inherit"
      >
        {text.slice(start, end + 1)}
      </mark>
    );
    cursor = end + 1;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
};

export default Highlight;
