// 上传前的文件探测。全部在浏览器里做，一个字节都还没发出去。
//
// 搬到 OSS 之后这里少了一半活：图片缩略图交给 OSS 图片处理实时生成
// （参数见 lib/oss-config.js 的 imageThumbUrl），不用客户端再编码一份、
// 也不用存第二份对象。只有视频还需要客户端截帧 —— OSS 没有抽帧能力。

// 2 GiB. OSS 本身能存到 48.8 TB，限制来自别处：分片上传最多 10000 片，
// 所以真正需要跟着放大的是分片大小（见 lib/oss-client.js）。
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

// 与 bucket 允许的类型保持一致。
export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v'
];

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v'
};

const EXT_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v'
};

/** 人类可读的文件大小。界面上的提示都从这里取，免得改上限时漏掉某处文案。 */
export const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;

  // 整数就别带小数点 —— 提示里写「2 GB」比「2.0 GB」自然，
  // 而 1.5 GB 这种该保留的还是要保留。
  const shown = Number.isInteger(value)
    ? value
    : value >= 10
      ? Math.round(value)
      : Number(value.toFixed(1));

  return `${shown} ${units[i]}`;
};

export const isVideoMime = (mime) => mime?.startsWith('video/');

export const kindFor = (mime) => (isVideoMime(mime) ? 'video' : 'image');

/**
 * Windows 对 .mov 报空的 file.type，.JPG 的大小写也不一定，所以不能只信 MIME。
 * 空类型时回退到扩展名。
 */
export function resolveMime(file) {
  if (file.type && ALLOWED_MIME.includes(file.type)) return file.type;

  const ext = file.name.split('.').pop()?.toLowerCase();
  const fromExt = EXT_MIME[ext];
  if (fromExt && ALLOWED_MIME.includes(fromExt)) return fromExt;

  return file.type || null;
}

/**
 * 对象键里绝不出现原始文件名。
 *
 * 从 MIME 推扩展名，意味着「爷爷婆婆及其同学.jpg」永远不会进入 OSS ——
 * 一次性绕开百分号转义、Invalid key 报错、NFC/NFD 归一化三个问题。
 * 中文留在 Postgres 的列里，UTF-8 在那儿不是问题。
 *
 * 前缀必须是上传者自己的 uid：STS 签发的临时凭证只允许写 {uid}/*。
 */
export const objectKey = (uid, id, mime) => {
  const ext = EXT_BY_MIME[mime] ?? 'bin';
  return { original: `${uid}/${id}.${ext}`, poster: `${uid}/${id}_poster.webp` };
};

// ---------------------------------------------------------------------------
// canvas 工具
// ---------------------------------------------------------------------------

const canEncodeWebp = () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
};

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), type, quality);
      return;
    }
    resolve(null);
  });

const once = (target, event, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${event} 超时`));
    }, timeoutMs);

    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${event} 失败`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });

// ---------------------------------------------------------------------------
// 探测
// ---------------------------------------------------------------------------

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // 有些格式这里解不开，但 <img> 仍然能渲染，往下走。
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await once(img, 'load');
    return img;
  } finally {
    // 解码已经完成，URL 不再需要；延后一拍避免某些浏览器把它当作尚未使用。
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** 只要自然尺寸 —— 缩略图由 OSS 生成，这里不需要编码。 */
async function probeImage(file) {
  const source = await loadImage(file);
  const width = source.width ?? source.naturalWidth;
  const height = source.height ?? source.naturalHeight;

  if (typeof source.close === 'function') source.close();

  return { kind: 'image', width, height, duration: null, poster: null, posterFailed: false };
}

/** 视频需要尺寸、时长，以及一帧封面。 */
async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, 'loadedmetadata');

    const width = video.videoWidth;
    const height = video.videoHeight;
    // 没有时长的流会报 Infinity，当成未知处理。
    const duration = Number.isFinite(video.duration) ? video.duration : null;

    let poster = null;
    try {
      // 截帧是最脆的一步：Chrome 解不了 HEVC，而 iPhone 录的 .mov 正是 HEVC，
      // 于是 seeked 永远不会触发 —— 所以这里必须有超时。
      video.currentTime = duration ? Math.min(1, duration / 2) : 0;
      await once(video, 'seeked', 5000);

      const scale = Math.min(1, 960 / Math.max(width || 1, height || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((width || 640) * scale));
      canvas.height = Math.max(1, Math.round((height || 360) * scale));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

      poster = await toBlob(canvas, canEncodeWebp() ? 'image/webp' : 'image/jpeg', 0.82);
    } catch {
      // 记录照常写入，灯箱照常能播原片，只有网格那一格退化成占位块。
      poster = null;
    }

    return { kind: 'video', width, height, duration, poster, posterFailed: !poster };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * 对可探测的文件不抛异常：解不开就返回一条没有尺寸、没有封面的记录，
 * 网格按长宽比占位渲染。因为一个封面失败就丢掉整个文件是不划算的。
 */
export async function probeFile(file, mime) {
  const kind = kindFor(mime);
  try {
    return kind === 'video' ? await probeVideo(file) : await probeImage(file);
  } catch {
    return { kind, width: null, height: null, duration: null, poster: null, posterFailed: kind === 'video' };
  }
}
