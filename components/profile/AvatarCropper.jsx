'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

import { AVATAR_SIZE, cropToSquareBlob } from '@/lib/crop-image';
import { uploadAvatar } from '@/lib/oss-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

// 选好文件之后先裁再传：直接传原图的话，一张 10MB 的手机照片会原样躺在 OSS 里，
// 而页面上只是显示成一个 40px 的圆 —— 白占存储也白占带宽。
//
// 裁剪在浏览器里做，不占服务端 CPU，也不依赖 OSS 的图片处理（那个虽然能缩放，
// 但裁成正方形并居中取景是交互决定的结果，不是纯参数能表达的）。
const AvatarCropper = ({ file, userId, onDone, onCancel }) => {
  // object URL 必须在 effect 里创建，不能放在 useMemo。
  //
  // 用 useMemo 建、再用 effect 清理的话，StrictMode 下会这样走一遍：
  //   挂载 -> 建出 blob:a -> 立刻执行清理把它 revoke -> 再次挂载，
  //   但 useMemo 记得的是同一个字符串，不会再建 -> 图片指向一个已失效的 URL。
  // 症状是裁剪框在、图不出来、onCropComplete 永不来，确认按钮一直是灰的。
  //
  // 放进 effect 之后，第二次挂载会重新建一个新的。
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const onCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
    setArea(croppedAreaPixels);
  }, []);

  async function handleConfirm() {
    setPending(true);
    setError(null);

    try {
      const blob = await cropToSquareBlob(src, area);
      if (!blob) throw new Error('裁剪失败，换一张图试试');

      // 扩展名跟着实际编码走 —— WebP 不可用时胶水层会退回 JPEG，
      // 此时还叫 .webp 就是内容与类型不符。
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      // 每次换头像都用新的文件名：对象是 immutable 长缓存的，
      // 复用同一个键的话浏览器和 OSS 都会一直给旧图。
      const key = `${userId}/avatar/${crypto.randomUUID()}.${ext}`;

      await uploadAvatar({ file: blob, objectKey: key });

      // 传对象键而不是 URL：写库和「删掉上一个头像」都由服务端做 ——
      // 删对象要长期 AK，而且「旧图是哪一个」必须服务端自己从库里读，
      // 不能信客户端传上来的值。
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '保存头像失败');

      onDone?.(data.avatarUrl);
    } catch (err) {
      setError(err?.message || '上传失败，请稍后重试');
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onCancel?.()}>
      // sm:max-w-none 见 AlbumClient 里那段说明：基础类带了 sm:max-w-sm，
      // 只写 max-w-none 压不住它，宽屏上会被卡到 384px。
      <DialogContent className="w-[min(94vw,560px)] max-w-none sm:max-w-none">
        <DialogTitle>裁剪头像</DialogTitle>
        <DialogDescription className="sr-only">
          拖动调整位置，滚轮或双指缩放。输出 {AVATAR_SIZE}×{AVATAR_SIZE} 的正方形。
        </DialogDescription>

        {/* Cropper 需要一个有确定高度且 position:relative 的容器。 */}
        <div className="relative h-80 w-full overflow-hidden rounded-lg bg-black">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <label className="flex items-center gap-3 text-xs tracking-wider text-muted-foreground">
          缩放
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 flex-1 accent-primary"
          />
        </label>

        <p aria-live="polite" className="min-h-4 text-sm text-destructive">
          {error}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={pending || !area}>
            {pending ? '上传中…' : '确认'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AvatarCropper;
