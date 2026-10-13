'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COLOR_KEYS, EVENT_COLORS } from '@/lib/appointments';
import { cn } from '@/lib/utils';

const COLOR_LABELS = {
  brand: '品牌',
  sky: '天蓝',
  amber: '琥珀',
  rose: '玫红',
  emerald: '翠绿'
};

// 框选出来的时间，读的时候要看得懂。全天事项只显示日期 ——
// 它的 ends_at 是次日的零点（排他），印出来会莫名其妙多一天。
function describeTime(appointment) {
  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const date = start.toLocaleDateString('zh-CN');

  if (appointment.all_day) {
    // 排他末端所以要减一天才是「最后一天」。
    const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const lastDate = lastDay.toLocaleDateString('zh-CN');
    return lastDate === date ? `${date}（全天）` : `${date} – ${lastDate}（全天）`;
  }

  const time = (d) =>
    d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time(start)} – ${time(end)}`;
}

export default function AppointmentEditor({
  appointment,
  open,
  onOpenChange,
  onSave,
  onDelete
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑事项</DialogTitle>
          <DialogDescription>
            {appointment ? describeTime(appointment) : ' '}
          </DialogDescription>
        </DialogHeader>

        {/* key 让「点开另一条」时表单状态自然重置，
            不用 useEffect 去把 props 同步进 state。 */}
        {appointment ? (
          <EditorForm
            key={appointment.id}
            appointment={appointment}
            onSave={onSave}
            onDelete={onDelete}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({ appointment, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(appointment.title ?? '');
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [color, setColor] = useState(appointment.color ?? 'brand');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    // 表上有 check (char_length(btrim(title)) between 1 and 200)，
    // 空标题会被数据库拒掉，不如在这里先拦一下并说清楚。
    const trimmed = title.trim();
    if (!trimmed) {
      setError('标题不能为空。');
      return;
    }

    setPending(true);
    setError('');
    const result = await onSave({ title: trimmed, notes: notes.trim(), color });
    setPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  const handleDelete = async () => {
    setPending(true);
    setError('');
    const result = await onDelete();
    setPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="appointment-title">事项</Label>
        <Input
          id="appointment-title"
          value={title}
          maxLength={200}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="appointment-notes">备注</Label>
        <Textarea
          id="appointment-notes"
          value={notes}
          maxLength={2000}
          rows={3}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">颜色</span>
        <div className="flex items-center gap-2">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={COLOR_LABELS[key]}
              aria-pressed={color === key}
              onClick={() => setColor(key)}
              style={{ backgroundColor: EVENT_COLORS[key] }}
              className={cn(
                'size-6 rounded-full ring-offset-2 ring-offset-popover transition-all',
                color === key ? 'ring-2 ring-foreground' : 'ring-1 ring-border'
              )}
            />
          ))}
        </div>
      </div>

      {error ? (
        <p aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="destructive"
          className="sm:mr-auto"
          disabled={pending}
          onClick={handleDelete}
        >
          删除
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </DialogFooter>
    </form>
  );
}
