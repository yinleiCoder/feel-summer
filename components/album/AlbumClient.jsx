'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { Upload } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { MEDIA_COLUMNS, fetchPage, toMasonryItem } from '@/lib/media';
import { canUpload } from '@/lib/roles';
import Masonry from '@/components/Masonry';
import AlbumSearch from '@/components/album/AlbumSearch';
import UploadDropzone from '@/components/album/UploadDropzone';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

// 搜索索引一次最多取这么多条。
// 相册是分页加载的（每次 24 条），只在已加载的那些里搜会漏掉大部分内容 ——
// 用户搜一个明明存在的标题却搜不到，比没有搜索更糟。所以第一次搜索时单独拉一份
// 轻量索引（只有元数据，不含文件本身）。
const SEARCH_INDEX_LIMIT = 1000;

// 输入到过滤之间的等待。250ms 是「打字时几乎感觉不到延迟」和
// 「不会每个字符都跑一次 Fuse + 重排 masonry」之间的平衡点。
const SEARCH_DEBOUNCE_MS = 250;

const AlbumClient = ({ initialItems, initialCursor, initialHasMore, viewer }) => {
  const supabase = useMemo(() => createClient(), []);
  const mayUpload = canUpload(viewer?.role);

  // toMasonryItem 不需要 client —— 文件在 OSS，地址是纯字符串拼的。
  const [items, setItems] = useState(() => (initialItems ?? []).map(toMasonryItem));
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // ---- 搜索 ----
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(null);
  const [indexLoading, setIndexLoading] = useState(false);

  const sentinelRef = useRef(null);
  // A ref, not state: setState is async, so two IntersectionObserver callbacks
  // firing in the same tick would both read `loading === false` and double-fetch.
  const inFlight = useRef(false);

  // 节流（准确说是防抖）：输入框里立刻显示字符，过滤等停手之后再跑。
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 必须在下面那个 effect 之前定义 —— 它出现在依赖数组里，写在使用之后会触发 TDZ。
  const searching = debounced.length > 0;

  // 第一次真正开始搜时才拉索引 —— 不搜的人一点额外开销都不付。
  //
  // 依赖里必须是 searching（布尔）而不是 debounced（字符串）：后者每敲一个字都变，
  // effect 就会重跑、cleanup 把「已取消」置位，于是刚发出去的请求结果被丢掉，
  // setIndexLoading(false) 永远不执行 —— indexLoading 卡在 true，
  // 之后每次都被开头的守卫拦下，索引再也拉不出来。
  // 取消只应该发生在卸载时，所以用一个挂载标记，而不是跟着输入变化。
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!searching || index !== null || indexLoading) return;

    setIndexLoading(true);

    (async () => {
      const { data, error: indexError } = await supabase
        .from('media')
        .select(MEDIA_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(SEARCH_INDEX_LIMIT);

      if (!mountedRef.current) return;
      // 失败时存空数组而不是 null：否则每次输入都会重新拉一遍失败的请求。
      setIndex(indexError ? [] : (data ?? []));
      setIndexLoading(false);
    })();
  }, [searching, index, indexLoading, supabase]);

  const fuse = useMemo(
    () =>
      index?.length
        ? new Fuse(index, {
            keys: [
              { name: 'title', weight: 2 },
              { name: 'description', weight: 1 }
            ],
            includeMatches: true,
            // 0 = 完全匹配，1 = 什么都算匹配。0.4 对中文标题足够宽容：
            // 打错一两个字、只记得半句，都能找到。
            threshold: 0.4,
            // 默认只在字符串开头附近找，长标题里靠后的词就搜不到了。
            ignoreLocation: true,
            minMatchCharLength: 1
          })
        : null,
    [index]
  );

  // Fuse 返回的结果已经按相关度排好序（score 升序），不需要再排一次。
  const results = useMemo(() => {
    if (!debounced || !fuse) return null;
    return fuse.search(debounced).map(({ item, matches }) => {
      const hit = matches?.find((m) => m.key === 'title');
      return toMasonryItem(item, hit?.indices ?? null);
    });
  }, [debounced, fuse]);

  const shown = searching ? (results ?? []) : items;

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore || !cursor) return;

    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const page = await fetchPage(supabase, cursor);
      setItems((prev) => {
        // Dedupe by id. With keyset pagination a row uploaded between page 1 and
        // page 2 can shift the window, and the optimistic prepend below can race
        // a page fetch — both would otherwise render a tile twice.
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...page.items.map((item) => toMasonryItem(item)).filter((t) => !seen.has(t.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      // hasMore is deliberately left alone so the sentinel stays armed and the
      // next scroll retries instead of silently ending the album.
      setError('加载失败，请稍后重试');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [cursor, hasMore, supabase]);

  useEffect(() => {
    if (!hasMore || searching) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      // Start a page early so the next batch is usually already painted by the
      // time the visitor arrives at it.
      { rootMargin: '800px 0px' }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, searching]);

  // 新标签页打开详情，而不是弹对话框。
  // 相册是浏览的上下文，详情是另一个上下文 —— 用对话框会把前者的滚动位置和
  // 已加载的分页盖掉；而且从详情页可以继续 Ctrl+点击开一堆标签慢慢看。
  const openDetail = useCallback((item) => {
    window.open(`/photo/${item.id}`, '_blank', 'noopener');
  }, []);

  // 上传成功后把新行就地插到最前面。新记录是最新的，而 masonry 是按顺序贪心
  // 摆放的，插到队首正好落在开头。不用 router.refresh()：items 是客户端状态，
  // 重刷反而会把已加载的分页丢掉。
  const handleUploaded = useCallback((row) => {
    if (!row) return;
    setItems((prev) => {
      if (prev.some((item) => item.id === row.id)) return prev;
      return [toMasonryItem(row), ...prev];
    });
    // 索引已经拉过了的话，新行也必须进去，否则搜不到刚传的东西。
    setIndex((prev) => (prev ? [row, ...prev] : prev));
  }, []);

  const uploadDialog = mayUpload ? (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
      <DialogContent
        // sm:max-w-none 不能省。DialogContent 的基础类里是 `max-w-[…] sm:max-w-sm`，
        // 而 tailwind-merge 只合并**同变体**的类 —— 只写 max-w-none 的话，
        // 它和不带前缀的 max-w-[…] 相互抵消，sm:max-w-sm（384px）却原样留着，
        // 于是宽屏上对话框反而被卡到 384px。
        className="max-h-[88dvh] w-[min(94vw,1100px)] max-w-none overflow-y-auto sm:max-w-none"
        // 上传过程中误点外部会让整个进度丢掉，所以只留关闭按钮这一条出路。
        // Escape 一并挡掉 —— 用户的原话是「只能点击关闭按钮取消」。
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogTitle>上传</DialogTitle>
        <DialogDescription className="sr-only">
          选择或拖入照片和视频，上传后会自动出现在相册里。
        </DialogDescription>
        <UploadDropzone viewer={viewer} onUploaded={handleUploaded} />
      </DialogContent>
    </Dialog>
  ) : null;

  const countLabel = searching
    ? indexLoading
      ? '正在建立搜索索引…'
      : `找到 ${shown.length} 个结果`
    : `共 ${items.length} 张${hasMore ? '（还在加载）' : ''}`;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <AlbumSearch value={query} onChange={setQuery} />
          {mayUpload && (
            <Button
              onClick={() => setUploadOpen(true)}
              className="h-11 shrink-0 gap-2 px-5"
            >
              <Upload className="size-4" />
              上传
            </Button>
          )}
        </div>

        <span className="text-xs tracking-[0.2em] text-muted-foreground">{countLabel}</span>
      </div>

      {shown.length > 0 ? (
        <Masonry
          items={shown}
          onSelect={openDetail}
          // 搜索时标题常驻 —— 命中高亮得先悬停才看得见的话，用户不知道自己为什么匹配上。
          showTitles={searching}
        />
      ) : (
        <p className="py-24 text-center text-sm text-muted-foreground">
          {/* 索引还没到位时说「没找到」是错的 —— 那会儿根本还没开始找。 */}
          {searching ? (indexLoading ? '正在搜索…' : '没有找到匹配的内容。') : '相册还是空的。'}
        </p>
      )}

      {!searching && mayUpload && items.length === 0 && (
        <div className="flex justify-center pb-8">
          <Button onClick={() => setUploadOpen(true)} className="gap-2 px-5">
            <Upload className="size-4" />
            上传第一张照片
          </Button>
        </div>
      )}

      {/* A sibling of Masonry, never a child: the grid root is position:relative
          with a computed height, so a child sentinel would either be clipped or
          perturb the very measurement the layout depends on.
          搜索时关掉 —— 结果是一次性的完整集合，没有「下一页」。 */}
      {!searching && hasMore && (
        <div ref={sentinelRef} className="flex h-32 items-center justify-center" aria-hidden="true">
          {loading && <span className="text-xs tracking-[0.2em] text-muted-foreground">加载中…</span>}
        </div>
      )}

      {!searching && !hasMore && items.length > 0 && (
        <p className="py-12 text-center text-xs tracking-[0.2em] text-muted-foreground">
          已经到底了 · 共 {items.length} 张
        </p>
      )}

      {error && (
        <p aria-live="polite" className="pb-8 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {uploadDialog}
    </>
  );
};

export default AlbumClient;
