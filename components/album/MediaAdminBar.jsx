'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { MEDIA_COLUMNS } from '@/lib/media';
import { canManage } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// 编辑说明 / 删除。原来这套在灯箱对话框里，灯箱改成新标签页的详情页之后挪到这里。
//
// 编辑走客户端直连（RLS 的 media_update_admin 放行）；
// 删除必须走服务端 —— 删 OSS 文件要长期 AK，而浏览器手里那份临时凭证
// 既没有 DeleteObject 权限，也不该有。
const MediaAdminBar = ({ row, viewer, onUpdated, onDeleted }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title ?? '');
  const [description, setDescription] = useState(row.description ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (!canManage(viewer)) return null;

  async function handleSave() {
    setPending(true);
    setError(null);

    const supabase = createClient();
    // media_freeze_identity 把 storage_path 和 uploaded_by 钉死了，
    // 所以这次更新不可能把记录挪到别的对象或别人名下。
    const { data, error: updateError } = await supabase
      .from('media')
      .update({ title: title.trim(), description: description.trim() })
      .eq('id', row.id)
      .select(MEDIA_COLUMNS)
      .single();

    setPending(false);
    if (updateError) {
      setError('保存失败，请稍后重试');
      return;
    }
    onUpdated?.(data);
    setEditing(false);
  }

  async function handleDelete() {
    setPending(true);
    setError(null);

    let ok = false;
    let payload = {};
    try {
      const res = await fetch(`/api/media/${row.id}`, { method: 'DELETE' });
      ok = res.ok;
      payload = await res.json().catch(() => ({}));
    } catch {
      ok = false;
    }

    setPending(false);
    if (!ok) {
      setError(payload?.error || '删除失败，请稍后重试');
      return;
    }
    onDeleted?.(row.id);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          编辑说明
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={pending}>
          {pending ? '删除中…' : '删除'}
        </Button>
        {error && <span className="self-center text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="media-title">标题</Label>
        <Input
          id="media-title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="media-description">说明</Label>
        <Textarea
          id="media-description"
          value={description}
          rows={4}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setTitle(row.title ?? '');
            setDescription(row.description ?? '');
            setEditing(false);
          }}
        >
          取消
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default MediaAdminBar;
