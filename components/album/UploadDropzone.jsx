'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { MEDIA_COLUMNS } from '@/lib/media';
import { uploadObject, uploadSmall } from '@/lib/oss-client';
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  formatBytes,
  kindFor,
  objectKey,
  probeFile,
  resolveMime
} from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Two at a time. A 40-file drop must not open 40 parallel uploads and starve the
// connection, but serial uploads waste the link on small files.
const CONCURRENCY = 2;

let localSeq = 0;

const STATUS_TEXT = {
  queued: '等待中',
  probing: '读取中',
  uploading: '上传中',
  saving: '保存中',
  done: '完成',
  error: '失败'
};

const UploadDropzone = ({ viewer, onUploaded }) => {
  const [entries, setEntries] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState([]);
  const inputRef = useRef(null);

  // Mirrors `entries` so the upload flow can read the *current* title and
  // description at insert time. Without this an edit typed while the file is
  // still uploading would be silently discarded, because the closure captured
  // the entry as it looked when the drop happened.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const patch = useCallback((id, changes) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }, []);

  const processOne = useCallback(
    async (entry) => {
      const supabase = createClient();

      try {
        patch(entry.id, { status: 'probing' });
        const probe = await probeFile(entry.file, entry.mime);

        // 预览直接用本地文件：图片不需要先生成缩略图（OSS 会实时缩），
        // 视频则用刚截下来的那一帧。
        patch(entry.id, {
          previewUrl: URL.createObjectURL(probe.poster ?? entry.file)
        });

        const keys = objectKey(viewer.id, entry.id, entry.mime);

        patch(entry.id, { status: 'uploading', progress: 0 });
        await uploadObject({
          file: entry.file,
          objectKey: keys.original,
          onProgress: (progress) => patch(entry.id, { progress })
        });

        // 只有视频有封面。它很小，走简单上传，不值得为几十 KB 走三次分片请求。
        // 失败也无所谓 —— 网格会退化成占位块，不影响原片播放。
        let posterKey = null;
        if (probe.poster) {
          try {
            await uploadSmall({ file: probe.poster, objectKey: keys.poster });
            posterKey = keys.poster;
          } catch {
            posterKey = null;
          }
        }

        patch(entry.id, { status: 'saving' });
        const latest = entriesRef.current.find((e) => e.id === entry.id) ?? entry;
        // .select().single() 把落库后的整行取回来，好让相册页就地插入这张新图，
        // 不必等一次整页刷新。
        const { data: inserted, error: insertError } = await supabase
          .from('media')
          .insert({
            kind: probe.kind,
            storage_path: keys.original,
            thumb_path: posterKey,
          title: latest.title.trim(),
          description: latest.description.trim(),
          width: probe.width,
          height: probe.height,
          duration_seconds: probe.duration,
          bytes: entry.file.size,
          mime_type: entry.mime,
            poster_failed: probe.posterFailed,
            // Must equal auth.uid() or the RLS WITH CHECK rejects the row.
            uploaded_by: viewer.id
          })
          .select(MEDIA_COLUMNS)
          .single();

        if (insertError) throw insertError;

        patch(entry.id, { status: 'done', progress: 1 });
        onUploaded?.(inserted);
      } catch (err) {
        // 记录是在对象之后写入的，所以这里失败可能留下一个孤儿对象 ——
        // 看不见、之后能清。反过来则会留下一块明显坏掉的砖。
        //
        // 直接把原始 message 透出来：配置期最需要的就是它
        // （比如「OSS 还没配置完整，缺少：…」）。
        patch(entry.id, { status: 'error', error: err?.message || '上传失败' });
      }
    },
    [patch, viewer.id, onUploaded]
  );

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList ?? []);
      if (!files.length) return;

      const accepted = [];
      const problems = [];

      for (const file of files) {
        const mime = resolveMime(file);
        if (!mime || !ALLOWED_MIME.includes(mime)) {
          problems.push(`${file.name}：不支持的文件类型`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          problems.push(`${file.name}：超过 ${formatBytes(MAX_FILE_BYTES)}`);
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          mime,
          kind: kindFor(mime),
          name: file.name,
          title: file.name.replace(/\.[^.]+$/, ''),
          description: '',
          status: 'queued',
          progress: 0,
          previewUrl: null,
          error: null,
          seq: (localSeq += 1)
        });
      }

      setRejected(problems);
      if (!accepted.length) return;

      setEntries((prev) => [...prev, ...accepted]);

      // Bounded worker pool: each worker pulls the next queued entry until the
      // queue drains, so CONCURRENCY is respected without a scheduler.
      const queue = [...accepted];
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          await processOne(next);
        }
      };

      const workerCount = Math.min(CONCURRENCY, accepted.length);
      for (let i = 0; i < workerCount; i += 1) {
        // Intentionally not awaited — the pool runs in the background while the
        // user keeps editing titles and can drop more files.
        void worker();
      }
    },
    [processOne]
  );

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const pendingCount = entries.filter(
    (e) => e.status !== 'done' && e.status !== 'error'
  ).length;
  const doneCount = entries.filter((e) => e.status === 'done').length;

  return (
    <div className="flex flex-col gap-6">
      <div
        data-dragover={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center transition-colors data-dragover:border-primary data-dragover:bg-primary/5"
      >
        <p className="text-sm text-muted-foreground">把照片或视频拖到这里</p>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          选择文件
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="text-[11px] tracking-wider text-muted-foreground">
          支持 JPG / PNG / WebP / GIF / AVIF / MP4 / WebM / MOV，单个不超过{' '}
          {formatBytes(MAX_FILE_BYTES)}
        </p>
      </div>

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          {rejected.map((message, i) => (
            <li key={i} className="text-xs text-destructive">
              {message}
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs tracking-[0.2em] text-muted-foreground">
            <span>
              共 {entries.length} 个 · 完成 {doneCount}
              {pendingCount > 0 && ` · 进行中 ${pendingCount}`}
            </span>
            {pendingCount === 0 && (
              <Link href="/album" className="text-foreground underline underline-offset-4">
                去相册看看
              </Link>
            )}
          </div>

          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex gap-4 rounded-xl border border-border/60 bg-card/50 p-3"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {entry.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      {entry.kind === 'video' ? '视频' : '图片'}
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{entry.name}</span>
                    <span
                      className={`ml-auto shrink-0 text-[11px] tracking-wider ${
                        entry.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {STATUS_TEXT[entry.status]}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`title-${entry.id}`} className="text-[11px]">
                      标题
                    </Label>
                    <Input
                      id={`title-${entry.id}`}
                      value={entry.title}
                      maxLength={120}
                      disabled={entry.status === 'done'}
                      onChange={(e) => patch(entry.id, { title: e.target.value })}
                      className="h-8"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`desc-${entry.id}`} className="text-[11px]">
                      说明（可稍后在相册里修改）
                    </Label>
                    <Input
                      id={`desc-${entry.id}`}
                      value={entry.description}
                      maxLength={2000}
                      disabled={entry.status === 'done'}
                      onChange={(e) => patch(entry.id, { description: e.target.value })}
                      className="h-8"
                    />
                  </div>

                  {entry.status !== 'done' && entry.status !== 'error' && (
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={Math.round(entry.progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${Math.round(entry.progress * 100)}%` }}
                      />
                    </div>
                  )}

                  {entry.error && <p className="text-xs text-destructive">{entry.error}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default UploadDropzone;
