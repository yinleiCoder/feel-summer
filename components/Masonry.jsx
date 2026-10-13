'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Highlight from '@/components/album/Highlight';

// Adapted from the React Bits Masonry component (variant Masonry-JS-TW).
//
// The registry original assumes the whole set of items is known up front and
// that the grid is the only thing on the page. Both assumptions break for a
// paginated, lazily-loaded album, so this version changes seven things. Each is
// marked with a `[n]` comment at the relevant line:
//
//   [1] The container gets a computed height. The original is `relative h-full`
//       with absolutely-positioned children, so it never grows past whatever
//       its parent gave it — the page would never scroll and the scroll sentinel
//       below the grid could never be reached.
//   [2] Only width is measured. Height is this component's *output*; feeding it
//       back through the ResizeObserver makes the packing memo re-run on every
//       layout it just produced.
//   [3] No preloadImages gate. The original awaits every image before painting
//       anything, and re-runs whenever `items` changes, so page 2 would re-await
//       pages 1+2. Heights come from stored dimensions instead, so the grid is
//       correct before any image data arrives — which is also what makes [4] safe.
//   [4] Tile heights are aspect-aware (`columnWidth * h / w`) instead of the
//       original's flat `child.height / 2`, which gave a landscape photo the
//       same tile as a portrait one.
//   [5] A real <img loading="lazy"> replaces the CSS background-image. Background
//       images are fetched as soon as the rule matches; there is no lazy path.
//   [6] `onSelect` replaces `window.open(item.url)`, so a click opens the in-app
//       lightbox. Rendering a <button> also makes the grid keyboard-navigable.
//   [7] Tweens are scoped to a gsap.context and skipped for items that have
//       already animated, so appended pages animate without replaying the whole
//       grid and no selector leaks outside this component.
//
// House rule, because it is the classic way this component breaks: React owns
// `left`/`top`/`width`/`height`; GSAP owns `transform`/`opacity`/`filter`.
// Never let both write the same property, or they overwrite each other on the
// next render and every tile jumps.

const GAP = 16;

const useMedia = (queries, values, defaultValue) => {
  const get = () => {
    if (typeof window === 'undefined') return defaultValue;
    return values[queries.findIndex((q) => matchMedia(q).matches)] ?? defaultValue;
  };

  const [value, setValue] = useState(get);

  useEffect(() => {
    const mediaQueries = queries.map((q) => matchMedia(q));
    const handler = () => setValue(get);
    mediaQueries.forEach((query) => query.addEventListener('change', handler));
    return () => mediaQueries.forEach((query) => query.removeEventListener('change', handler));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries]);

  return value;
};

// [2]
const useMeasureWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      // Bail on no-op updates. A height-only change still fires this observer,
      // and without the guard it would invalidate the packing memo each time.
      setWidth((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
};

const isVideo = (item) => item.kind === 'video';

// Top-right rather than bottom-right: the bottom of the tile now belongs to the
// hover overlay, and a badge sitting inside that gradient reads as a smudge.
const VideoBadge = ({ duration, failed }) => (
  <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] leading-none tracking-wider text-white/90 backdrop-blur-sm">
    {failed ? (
      '封面不可用'
    ) : (
      <>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
          <path d="M8 5v14l11-7z" />
        </svg>
        {duration ?? '视频'}
      </>
    )}
  </span>
);

// Gradient from clear at the top to black at the bottom, carrying who uploaded it
// and what it is called. `group-focus-visible` matters as much as `group-hover`:
// the tile is a real button, so keyboard users get the same information.
//
// The avatar is shadcn's Avatar, whose root is a span (Radix's default). That is
// what makes it legal here — the tile is a button, which only accepts phrasing
// content, so a div-based avatar would produce invalid HTML.
// `after:hidden` drops the component's default outline ring, which reads as dirt
// against the dark gradient.
const HoverMeta = ({ name, avatar, title, titleMatches, alwaysShow }) => (
  <span
    className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end gap-2 bg-linear-to-t from-black/90 via-black/55 to-transparent px-3 pt-12 pb-3 transition-opacity duration-300 ${
      alwaysShow
        ? 'opacity-100'
        : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
    }`}
  >
    <Avatar size="sm" aria-hidden="true" className="size-7 after:hidden">
      {avatar && <AvatarImage src={avatar} alt="" />}
      <AvatarFallback className="bg-white/20 text-[11px] text-white">
        {(name || '知')[0]}
      </AvatarFallback>
    </Avatar>
    <span className="min-w-0 truncate text-xs leading-tight text-white">
      {/* 搜索时高亮命中片段。Markdown 的 <mark> 默认是黄底，在深色站里太跳，
          所以 Highlight 里换成了主色低透明度。 */}
      {titleMatches?.length ? (
        <Highlight text={title || '未命名'} indices={titleMatches} />
      ) : (
        title || '未命名'
      )}
    </span>
  </span>
);

const Masonry = ({
  items,
  onSelect,
  gap = GAP,
  ease = 'power3.out',
  duration = 0.6,
  stagger = 0.05,
  animateFrom = 'bottom',
  scaleOnHover = true,
  hoverScale = 0.95,
  blurToFocus = true,
  colorShiftOnHover = false,
  // 搜索时标题常驻（而不是只在悬停时出现），这样命中高亮才看得见。
  showTitles = false,
  className = ''
}) => {
  const columns = useMedia(
    ['(min-width:1500px)', '(min-width:1000px)', '(min-width:600px)', '(min-width:400px)'],
    [5, 4, 3, 2],
    1
  );

  const [containerRef, width] = useMeasureWidth();

  // Ref map rather than `[data-key="…"]` selectors: ids are uuids from the
  // database, but a selector string would also match nodes outside this
  // component — including the lightbox's copy of the same item. [7]
  const tileRefs = useRef(new Map());

  const registerTile = useCallback((id, el) => {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  }, []);

  // [1] + [3] + [4]
  const { tiles, height } = useMemo(() => {
    if (!width || !items.length) return { tiles: [], height: 0 };

    const colHeights = new Array(columns).fill(0);
    const columnWidth = (width - gap * (columns - 1)) / columns;

    const placed = items.map((item) => {
      // Greedy shortest-column packing, in order. Appending a page never
      // reshuffles earlier tiles, which is what keeps pagination stable.
      const col = colHeights.indexOf(Math.min(...colHeights));
      const aspect =
        item.width > 0 && item.height > 0
          ? item.width / item.height
          : isVideo(item)
            ? 16 / 9
            : 4 / 3;

      const h = Math.round(columnWidth / aspect);
      const tile = {
        ...item,
        x: Math.round(col * (columnWidth + gap)),
        y: Math.round(colHeights[col]),
        w: Math.round(columnWidth),
        h
      };

      colHeights[col] += h + gap;
      return tile;
    });

    return { tiles: placed, height: Math.max(0, Math.round(Math.max(...colHeights)) - gap) };
  }, [columns, items, width, gap]);

  // ---- animation ------------------------------------------------------------
  const ctxRef = useRef(null);
  const animatedIds = useRef(new Set());

  useLayoutEffect(() => {
    // Scoped so `gsap.context` can revert every tween this component created in
    // one call on unmount. [7]
    ctxRef.current = gsap.context(() => {}, containerRef);
    return () => {
      ctxRef.current?.revert();
      ctxRef.current = null;
    };
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !tiles.length) return;

    // Newly appended tiles only — items already on screen keep their state.
    const fresh = tiles.filter((tile) => !animatedIds.current.has(tile.id));
    if (!fresh.length) return;

    const isFirstBatch = animatedIds.current.size === 0;
    const reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // A grid just appended by pagination should not take 24 * 0.05s to appear.
    const delayStep = isFirstBatch ? stagger : Math.min(stagger, 0.03);

    ctxRef.current?.add(() => {
      fresh.forEach((tile, index) => {
        const el = tileRefs.current.get(tile.id);
        animatedIds.current.add(tile.id);
        if (!el) return;

        if (reduceMotion) {
          gsap.set(el, { opacity: 1, x: 0, y: 0, clearProps: 'filter' });
          return;
        }

        const offset = startOffset(tile, animateFrom, container);

        gsap.fromTo(
          el,
          {
            opacity: 0,
            x: offset.x,
            y: offset.y,
            ...(blurToFocus ? { filter: 'blur(10px)' } : null)
          },
          {
            opacity: 1,
            x: 0,
            y: 0,
            ...(blurToFocus ? { filter: 'blur(0px)' } : null),
            duration: isFirstBatch ? 0.8 : duration,
            ease: isFirstBatch ? 'power3.out' : ease,
            delay: index * delayStep
          }
        );
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, animateFrom, blurToFocus, duration, ease, stagger, containerRef]);

  const handleMouseEnter = (tile, element) => {
    if (scaleOnHover) {
      // overwrite:'auto' kills a conflicting scale tween but leaves an
      // in-flight entrance tween (x/y/opacity) alone.
      gsap.to(element, { scale: hoverScale, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
    }
    if (colorShiftOnHover) {
      const overlay = element.querySelector('.color-overlay');
      if (overlay) gsap.to(overlay, { opacity: 0.3, duration: 0.3, overwrite: 'auto' });
    }
    void tile;
  };

  const handleMouseLeave = (element) => {
    if (scaleOnHover) {
      gsap.to(element, { scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
    }
    if (colorShiftOnHover) {
      const overlay = element.querySelector('.color-overlay');
      if (overlay) gsap.to(overlay, { opacity: 0, duration: 0.3, overwrite: 'auto' });
    }
  };

  return (
    <div
      ref={containerRef}
      // [1] The explicit height is what makes the document grow, so the page
      // scrolls and the pagination sentinel below it can be reached.
      style={{ height }}
      className={`relative w-full ${className}`.trim()}
    >
      {tiles.map((tile) => (
        <button
          key={tile.id}
          ref={(el) => registerTile(tile.id, el)}
          type="button"
          data-key={tile.id}
          onClick={() => onSelect?.(tile)}
          onMouseEnter={(e) => handleMouseEnter(tile, e.currentTarget)}
          onMouseLeave={(e) => handleMouseLeave(e.currentTarget)}
          aria-label={tile.alt || tile.title || '查看'}
          className="group absolute box-border overflow-hidden rounded-[10px] bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            left: tile.x,
            top: tile.y,
            width: tile.w,
            height: tile.h,
            willChange: 'transform, opacity'
          }}
        >
          {/* [5] A real <img> is the only way to get native lazy loading; a CSS
              background-image is fetched the moment the rule matches. The
              width/height attributes give the browser an intrinsic ratio, so a
              lazy tile that has not loaded yet still reserves its exact box and
              the column never shifts. */}
          {tile.img ? (
            <img
              src={tile.img}
              alt={tile.alt ?? ''}
              width={tile.width || undefined}
              height={tile.height || undefined}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            // A video whose poster frame could not be captured (HEVC .mov in a
            // browser that cannot decode it). The tile still occupies its true
            // box and the lightbox can still play the original.
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <span className="text-[10px] tracking-wider text-muted-foreground">
                封面不可用
              </span>
            </div>
          )}

          {isVideo(tile) && <VideoBadge duration={tile.durationText} failed={tile.posterFailed} />}

          <HoverMeta
            name={tile.uploaderName}
            avatar={tile.uploaderAvatar}
            title={tile.title}
            titleMatches={tile.titleMatches}
            // 搜索时直接把标题亮出来 —— 否则高亮得先悬停才看得见，
            // 用户根本不知道自己为什么匹配上了。
            alwaysShow={showTitles}
          />

          {colorShiftOnHover && (
            <div className="color-overlay pointer-events-none absolute inset-0 bg-linear-to-tr from-pink-500/50 to-sky-500/50 opacity-0" />
          )}
        </button>
      ))}
    </div>
  );
};

// Entrance start position, expressed as a transform *delta* from the tile's
// resting place. The original returned absolute coordinates and animated x/y to
// match, which only works because it never set left/top at all.
const startOffset = (tile, animateFrom, container) => {
  const rect = container.getBoundingClientRect();
  const restTop = rect.top + tile.y;
  const restLeft = rect.left + tile.x;

  let direction = animateFrom;
  if (direction === 'random') {
    direction = ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)];
  }

  switch (direction) {
    case 'top':
      return { x: 0, y: -(restTop + 200) };
    case 'bottom':
      return { x: 0, y: window.innerHeight + 200 - restTop };
    case 'left':
      return { x: -(restLeft + 200), y: 0 };
    case 'right':
      return { x: window.innerWidth + 200 - restLeft, y: 0 };
    case 'center':
      return {
        x: rect.width / 2 - (tile.x + tile.w / 2),
        y: window.innerHeight / 2 - (restTop + tile.h / 2)
      };
    default:
      return { x: 0, y: 100 };
  }
};

export default Masonry;
