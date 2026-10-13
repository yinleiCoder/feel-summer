// 媒体数据层：查询形态、游标格式、URL 拼接。
//
// 服务端渲染和客户端分页共用这一份，两边就不可能对列集合或游标语义产生分歧。

import { imageThumbUrl, objectUrl } from '@/lib/oss-config';

export const PAGE_SIZE = 24;

// 只有在拿不到真实尺寸时才用的兜底长宽比 —— 比如浏览器解不开的图片。
// 每块砖都必须先有个长宽比，否则图片陆续到达时整个网格会不停重排。
export const FALLBACK_ASPECT = 4 / 3;
export const VIDEO_FALLBACK_ASPECT = 16 / 9;

const MEDIA_FIELDS = [
  'id',
  'kind',
  'storage_path',
  'thumb_path',
  'title',
  'description',
  'width',
  'height',
  'duration_seconds',
  'bytes',
  'mime_type',
  'poster_failed',
  'uploaded_by',
  'created_at'
].join(',');

// 一并带上上传者的资料：网格悬停时要显示头像和名字，免得每块砖再单独查一次。
// 能内联是因为 media.uploaded_by 有指向 profiles.id 的真实外键 —— 两个表都直连
// auth.users 的话 PostgREST 就找不到这层关系。
export const MEDIA_COLUMNS = `${MEDIA_FIELDS},profiles(display_name,avatar_url)`;

// 一对多的内联可能返回对象，也可能返回单元素数组，两种都接住。
export const embeddedProfile = (row) => {
  const profile = Array.isArray(row?.profiles) ? row.profiles[0] : row?.profiles;
  return { name: profile?.display_name || '', avatar: profile?.avatar_url || null };
};

export const aspectOf = (row) => {
  if (row.width > 0 && row.height > 0) return row.width / row.height;
  return row.kind === 'video' ? VIDEO_FALLBACK_ASPECT : FALLBACK_ASPECT;
};

// "1:23" for videos, null for images.
export const formatDuration = (seconds) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const total = Math.round(Number(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * 一页媒体，新的在前。
 *
 * 用 (created_at desc, id desc) 的 keyset 分页，不用 OFFSET：
 * now() 是事务时间，一次多文件上传会共享同一个 created_at，靠 id 破平；
 * 而且 OFFSET 在用户翻页期间有新行插入时会错位，导致重复或漏掉。
 */
export async function fetchPage(supabase, cursor) {
  let query = supabase
    .from('media')
    .select(MEDIA_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // 多取一行当作「还有下一页吗」的探针，比单独 count() 便宜也更准。
    .limit(PAGE_SIZE + 1);

  if (cursor) {
    // ISO-8601 时间戳和 uuid 里既没有逗号也没有括号，而这是 PostgREST 的
    // or 语法里唯二的结构性字符，所以直接插值在这里是安全的。
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > PAGE_SIZE;
  const rows = hasMore ? data.slice(0, PAGE_SIZE) : data;
  const last = rows[rows.length - 1];

  return {
    items: rows,
    nextCursor: last ? { createdAt: last.created_at, id: last.id } : null,
    hasMore
  };
}

/**
 * 数据库行 -> Masonry 条目。
 *
 * 这里的 width/height 是**原图**的自然像素尺寸，网格据此换算成响应式长宽比 ——
 * 这正是「一张图片字节都还没到，布局就已经正确」的原因，也是 loading="lazy" 安全的前提。
 *
 * 不需要 supabase client：文件在 OSS，地址是纯字符串拼出来的。
 */
/**
 * @param titleMatches 可选的 Fuse 匹配区间（搜索时用），渲染成标题高亮。
 */
export const toMasonryItem = (row, titleMatches = null) => {
  const poster = row.kind === 'video' ? objectUrl(row.thumb_path) : null;
  const uploader = embeddedProfile(row);

  return {
    id: row.id,
    titleMatches,
    uploaderName: uploader.name,
    uploaderAvatar: uploader.avatar,
    // 图片走 OSS 图片处理实时缩略，所以原图只存一份。
    // 视频没有这个能力，用的是上传时截帧生成的那张封面。
    img: row.kind === 'video' ? poster : imageThumbUrl(row.storage_path),
    title: row.title,
    alt: row.title || (row.kind === 'video' ? '视频' : '照片'),
    width: row.width,
    height: row.height,
    kind: row.kind,
    durationSeconds: row.duration_seconds,
    durationText: formatDuration(row.duration_seconds),
    posterFailed: row.poster_failed,
    row
  };
};
