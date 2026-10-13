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

/** 网格用的缩略图宽度。桌面 5 列时每格约 280px，960 已经够 retina。 */
export const THUMB_WIDTH = 960;

/**
 * 图片缩略图。交给 OSS 图片处理实时生成，所以原图只存一份。
 *
 * 不转换格式是有原因的：GIF 一旦转成 WebP 就只剩第一帧，动图直接没了。
 * 其余格式才加 format,webp —— 同样画质下体积大概减半。
 */
export const imageThumbUrl = (key, width = THUMB_WIDTH) => {
  if (!key || !OSS_ORIGIN) return null;
  const base = `${OSS_ORIGIN}/${key}`;
  const resize = `image/resize,w_${width}`;
  const isGif = /\.gif$/i.test(key);
  return `${base}?x-oss-process=${isGif ? resize : `${resize}/format,webp`}`;
};
