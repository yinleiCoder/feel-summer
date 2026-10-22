// OSS 的公开配置与 URL 拼接。服务端和浏览器都要用。
//
// bucket / region 用 NEXT_PUBLIC_ 是有意的：它们不是密钥，而且会出现在每一个
// 图片 URL 里，浏览器拿不到就没法拼地址。真正的密钥（AccessKey / RoleArn）
// 只在 lib/oss.js 里读，那个文件带 server-only。

export const OSS_REGION = (process.env.NEXT_PUBLIC_OSS_REGION ?? '').trim();
export const OSS_BUCKET = (process.env.NEXT_PUBLIC_OSS_BUCKET ?? '').trim();

/**
 * 自定义端点，可选。填 CDN 或传输加速域名时用。
 *
 * 这里做了两件容错，因为填错的后果很隐蔽 —— 不会报错，只会生成一个
 * 相对于本站的 URL，然后在控制台里表现为 404：
 *
 *   1. 没写协议就补 https://（`cdn.example.com` 是常见填法）；
 *   2. 主机名里没有点的一律判为无效并忽略。
 *      没有点的「域名」几乎一定是把 bucket 名填到了这一格 —— 而 bucket 名正好
 *      是单个词。忽略它，下面就会退回按 bucket+region 推导，页面恢复正常，
 *      而不是悄悄坏掉。
 */
const normalizeEndpoint = (raw) => {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) return '';
    return url.origin;
  } catch {
    return '';
  }
};

// 默认端点。EXPOSE 出去是为了让调用方能判断配置是否完整。
export const OSS_ENDPOINT = normalizeEndpoint(process.env.NEXT_PUBLIC_OSS_ENDPOINT);

export const OSS_ORIGIN =
  OSS_ENDPOINT || (OSS_REGION && OSS_BUCKET ? `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com` : '');

export const ossConfigured = () => Boolean(OSS_ORIGIN);

/**
 * 对象地址（原图 / 视频本体）。
 * 只在这里拼 URL —— 将来换 CDN 或换 bucket，改这一个函数。
 */
export const objectUrl = (key) => (key && OSS_ORIGIN ? `${OSS_ORIGIN}/${key}` : null);

/** 网格缩略图的长边上限。桌面 5 列时每格约 280px，960 已经够 retina。 */
export const THUMB_LONG_EDGE = 960;

/**
 * 图片缩略图。交给 OSS 图片处理实时生成，所以原图只存一份。
 *
 * `m_lfit` + 同时给 w/h = 等比缩放到 w×h 的框内，**不裁剪、不拉伸**：
 * 竖图只会被限制到长边 960（例如 3:4 的图返回 720×960），不会被裁成方图，
 * 也不会因为只限宽而得到一个 960×1280 的大缩略图。
 *
 * `auto-orient,1` 必须放在 resize 前面：手机竖拍的原图常常是「横向像素 +
 * EXIF 方向」，不先摆正的话缩略图会横着回来，和外层按数据库宽高算出的
 * 长宽比对不上，CSS 的 object-cover 就会把它裁掉。
 *
 * GIF 不转 WebP（动图会只剩第一帧），也不做 auto-orient（GIF 没有方向元数据）。
 */
export const imageThumbUrl = (key, longEdge = THUMB_LONG_EDGE) => {
  if (!key || !OSS_ORIGIN) return null;
  const base = `${OSS_ORIGIN}/${key}`;
  const resize = `resize,m_lfit,w_${longEdge},h_${longEdge}`;
  const isGif = /\.gif$/i.test(key);
  return `${base}?x-oss-process=${isGif ? `image/${resize}` : `image/auto-orient,1/${resize}/format,webp`}`;
};
