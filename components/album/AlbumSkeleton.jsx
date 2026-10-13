// Streaming placeholder. Column heights are deliberately uneven so the grid does
// not visibly re-flow when the real tiles replace it.
const COLUMNS = [
  ['h-64', 'h-40', 'h-72'],
  ['h-40', 'h-80', 'h-48'],
  ['h-72', 'h-48', 'h-56'],
  ['h-48', 'h-64', 'h-40']
];

const AlbumSkeleton = () => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
    {COLUMNS.map((column, i) => (
      <div key={i} className="flex flex-col gap-4">
        {column.map((h, j) => (
          <div key={j} className={`${h} animate-pulse rounded-[10px] bg-muted`} />
        ))}
      </div>
    ))}
  </div>
);

export default AlbumSkeleton;
