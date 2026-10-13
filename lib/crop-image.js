// 把 react-easy-crop 给出的裁剪区域画成一张方图。
//
// react-easy-crop 只负责交互和算出 croppedAreaPixels（原图像素坐标），
// 真正把像素抠出来这一步它不提供 —— 这是那 ~30 行胶水。

/** 头像输出边长。512 够 retina 显示 256px 的头像，再大就是白传。 */
export const AVATAR_SIZE = 512;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    // 同源的 object URL 不需要，但带上无害；将来若改用远端图会需要。
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), type, quality);
      return;
    }
    resolve(null);
  });

const canEncodeWebp = () => {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
};

/**
 * @param imageSrc  图片地址（通常是一个 object URL）
 * @param area      react-easy-crop 的 croppedAreaPixels：{ x, y, width, height }
 * @param size      输出边长
 * @returns Blob —— 失败时返回 null，调用方需要自己兜底
 */
export async function cropToSquareBlob(imageSrc, area, size = AVATAR_SIZE) {
  if (!area || !area.width || !area.height) return null;

  const image = await loadImage(imageSrc);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  // 头像会被缩到很小的尺寸显示，降采样质量直接决定边缘是否干净。
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    size,
    size
  );

  // WebP 大约是同等画质 JPEG 的一半；老浏览器退回 JPEG。
  return toBlob(canvas, canEncodeWebp() ? 'image/webp' : 'image/jpeg', 0.9);
}
