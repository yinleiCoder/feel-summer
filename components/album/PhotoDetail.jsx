'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { formatDuration, toMasonryItem } from '@/lib/media';
import { imageThumbUrl, objectUrl } from '@/lib/oss-config';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import MediaAdminBar from '@/components/album/MediaAdminBar';
import VideoPlayer from '@/components/album/VideoPlayer';

// ssr: false 是必须的，不是为了省字节：lightGallery 会在 SSR 时调用 Date.now()，
// 而开了 cacheComponents 之后，预渲染阶段一碰到不稳定取值就把整条路由判成
// 「blocking route」。画廊是纯客户端弹层，首屏 HTML 里本来也没有它。
// 详见 components/album/PhotoGallery.jsx 顶部的说明。
const PhotoGallery = dynamic(() => import('@/components/album/PhotoGallery'), { ssr: false });

// 数据库行 -> lightGallery 条目。
//
// src 用**原图**：画廊就是拿来看细节的，网格那套 960px 缩略图一放大就糊。
// thumb 单独给一张 200px 小图，底部缩略图条用它 —— 否则开一次画廊等于把整个
// 相册的原图都拉一遍。lgSize 是 "宽-高"，lightGallery 靠它算放大动画的起止尺寸；
// 缺了它放大就没有「从缩略图长出来」的过渡。
//
// 视频不进画廊，所以这里只处理图片。
const toGalleryItem = (row) => ({
  src: objectUrl(row.storage_path),
  thumb: imageThumbUrl(row.storage_path, 200),
  alt: row.title || '照片',
  caption: row.title || '',
  lgSize: row.width && row.height ? `${row.width}-${row.height}` : undefined
});

const PhotoDetail = ({ row: initialRow, slides, index, viewer, author, children }) => {
  const router = useRouter();
  const [row, setRow] = useState(initialRow);
  const [open, setOpen] = useState(false);
  const [originRect, setOriginRect] = useState(null);
  const mediaRef = useRef(null);

  // 当前这条可能不在 slides 里：它是视频，或者它比 ALBUM_LIMIT 更旧。
  // 前者不给入口；后者把它自己补到队首，别让点击放大变成死链接。
  const { galleryRows, startIndex } = useMemo(() => {
    if (index >= 0) return { galleryRows: slides, startIndex: index };
    if (row.kind === 'image') return { galleryRows: [row, ...slides], startIndex: 0 };
    return { galleryRows: [], startIndex: -1 };
  }, [slides, index, row]);

  const [current, setCurrent] = useState(startIndex >= 0 ? startIndex : 0);
  const inGallery = startIndex >= 0;

  const items = useMemo(() => galleryRows.map(toGalleryItem), [galleryRows]);
  const preview = toMasonryItem(row);
  const original = objectUrl(row.storage_path);

  // 视频的「切走暂停 / 卸载停止」搬进了 VideoPlayer —— 播放器自己持有实例，
  // 在这里再拿一次 DOM 反而绕远。

  const openGallery = useCallback(() => {
    // 记下图片此刻的位置，lightGallery 用它做「从缩略图长出来」的放大动画。
    // 受控模式下没有触发元素可供它自己测量，只能我们喂。
    const r = mediaRef.current?.getBoundingClientRect();
    setOriginRect(r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
    setCurrent(startIndex);
    setOpen(true);
  }, [startIndex]);

  const closeGallery = useCallback(() => {
    setOpen(false);
    // 在画廊里翻到了别的照片，关掉之后详情页也该停在那一张 ——
    // 否则「翻到第 5 张，关掉却回到第 1 张」很突兀。
    if (current !== startIndex && galleryRows[current]) {
      router.replace(`/photo/${galleryRows[current].id}`);
    }
  }, [current, startIndex, galleryRows, router]);

  return (
    <>
      <div className="mx-auto flex w-full max-w-350 flex-col gap-14 px-4 pb-16 lg:px-8">
        {/* 上：媒体 + 信息。
            items-start 让两侧都不被对方拉伸 —— 右边信息再长，黑底也不会跟着变高。 */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* 左：媒体本体。图片可点，进入画廊；视频只放播放器。
            背景用不透明的纯黑而不是 bg-black/50 —— 半透明黑会透出页面底色，
            在浅色主题下就是一块灰；照片和视频的留白都该是黑的。圆角跟网格的
            rounded-[10px] 对齐，18px 在这里显得太圆了。

            桌面端是 aspect-video（16:9），**不再**跟着视口高走（原来是 min-h-[78dvh]）：
            竖屏和大屏下高度会随窗口变，同一个页面在两台机器上比例完全不同。
            改成由宽度定高之后，这一块在任何桌面尺寸下都是 16:9 ——
            竖图竖视频会在这个框里居中留黑边，这是有意的，媒体区本身的比例是版式的一部分。

            lg:min-h-0 不能省：上面那个 min-h-[50dvh] 是给移动端的，
            而 min-height 的优先级高于 aspect-ratio，不清掉的话桌面端一旦视口偏矮，
            16:9 就被顶开、比例失效。 */}
        <div
          data-testid="media-stage"
          className="flex min-h-[50dvh] flex-1 items-center justify-center overflow-hidden rounded-lg bg-black lg:aspect-video lg:min-h-0"
        >
          {row.kind === 'video' ? (
            <VideoPlayer
              src={original}
              poster={preview.img || undefined}
              title={row.title}
              width={row.width}
              height={row.height}
            />
          ) : (
            <button
              type="button"
              onClick={openGallery}
              disabled={!inGallery}
              aria-label="放大查看"
              className="flex h-full w-full cursor-zoom-in items-center justify-center p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* lg:max-h-full：桌面端的高度上限交给外层那个 16:9 的框，
                  不能再按视口算 —— 否则一张竖图会顶出框外被 overflow-hidden 切掉。 */}
              <img
                ref={mediaRef}
                src={original}
                alt={row.title || '照片'}
                className="max-h-[74dvh] w-full object-contain lg:max-h-full"
              />
            </button>
          )}
        </div>

        {/* 右：信息。桌面固定 400px，移动端堆到下方。留言不在这里 —— 见下方。 */}
        <aside className="flex w-full flex-col gap-5 lg:w-100 lg:shrink-0">
          <header className="flex items-center gap-3">
            <Avatar size="lg" aria-hidden="true">
              {author?.avatar && <AvatarImage src={author.avatar} alt="" />}
              <AvatarFallback>{(author?.displayName || '知')[0]}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm">{author?.displayName || '知夏'}</p>
              <p className="text-[11px] tracking-wider text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString('zh-CN')}
              </p>
            </div>
          </header>

          <div>
            <h1 className="text-lg leading-snug font-semibold">{row.title || '未命名'}</h1>
            {row.description && (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {row.description}
              </p>
            )}
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] tracking-wider text-muted-foreground">
            {row.width && row.height && (
              <div className="flex gap-1">
                <dt>尺寸</dt>
                <dd>
                  {row.width}×{row.height}
                </dd>
              </div>
            )}
            {row.kind === 'video' && formatDuration(row.duration_seconds) && (
              <div className="flex gap-1">
                <dt>时长</dt>
                <dd>{formatDuration(row.duration_seconds)}</dd>
              </div>
            )}
            {inGallery && galleryRows.length > 1 && (
              <div className="flex gap-1">
                <dt>相册</dt>
                <dd>
                  第 {startIndex + 1} / {galleryRows.length} 张
                </dd>
              </div>
            )}
          </dl>

          <MediaAdminBar
            row={row}
            viewer={viewer}
            onUpdated={setRow}
            onDeleted={() => router.replace('/album')}
          />

          {/* 这里原来还放了一张缩略图当作「点击放大」的入口 —— 但左栏已经是同一张图，
              同一页出现两张一样的图只是噪音。提示文字留着就够了。 */}
          {inGallery && (
            <p className="text-[11px] tracking-wider text-muted-foreground">
              点左侧图片放大 · 画廊内 ← → 翻页
            </p>
          )}

        </aside>
        </div>

        {/* 下：留言占满整宽。
            原来它在右侧那 400px 的栏里，留言一多就把整行撑高，而黑底是 flex 项、
            默认 stretch —— 于是左边那张图跟着被拉成一条竖直的黑柱。挪出来之后，
            上排的高度只由图片决定，留言再长也只往下长。 */}
        {/* 留言由 page.js 在服务端取好、作为 children 传进来（外面套着 Suspense
            和骨架屏）。这里只负责给它一个位置。 */}
        <div className="border-t border-border/60 pt-10">{children}</div>
      </div>

      {/* 只有真要打开时才挂载，进一步把这份重量往后推。 */}
      {open && (
        <PhotoGallery
          open={open}
          onClose={closeGallery}
          index={current}
          onIndexChange={setCurrent}
          slides={items}
          originRect={originRect}
        />
      )}
    </>
  );
};

export default PhotoDetail;
