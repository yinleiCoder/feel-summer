'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import AppointmentEditor from '@/components/schedule/AppointmentEditor';
import ScheduleSkeleton from '@/components/schedule/ScheduleSkeleton';
import {
  APPOINTMENT_COLUMNS,
  DEFAULT_TITLE,
  timesFromEvent,
  toCalendarEvent
} from '@/lib/appointments';
import { createClient } from '@/lib/supabase/client';

// FullCalendar 只能在浏览器里跑：它内部要算「今天」，而 cacheComponents 打开后
// 预渲染阶段碰到 Date.now() 会让整条路由构建失败。整个日历模块（含工具栏）
// 一起挡在服务端渲染之外，理由和 components/album/PhotoGallery.jsx 一样。
const ScheduleCalendar = dynamic(() => import('@/components/schedule/ScheduleCalendar'), {
  ssr: false,
  loading: () => <ScheduleSkeleton />
});

/**
 * 预约页的客户端外壳：持有全部状态，负责写库。
 *
 * 写库走浏览器端 supabase client，和 components/album/CommentThread.jsx 一样
 * 由 RLS 兜底，不走 Server Action —— 拖动和拉伸要即时反馈，每次交互绕一趟
 * 服务端会明显发涩，而 RLS 提供的保护是一样的。
 */
export default function ScheduleClient({ initialAppointments, viewer }) {
  const [rows, setRows] = useState(initialAppointments);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const events = useMemo(() => rows.map(toCalendarEvent), [rows]);
  const editing = useMemo(
    () => rows.find((row) => row.id === editingId) ?? null,
    [rows, editingId]
  );

  /**
   * 框选出一段时间 -> 立刻建一条「新事项」，之后点击改名。
   *
   * 乐观插入：先用一个临时 id 放进本地状态，界面上马上就有这条；
   * 插入成功后换成数据库返回的真实行，失败则整条撤掉。
   */
  const handleSelectRange = useCallback(
    async ({ start, end, allDay }) => {
      const supabase = createClient();
      const tempId = `pending-${crypto.randomUUID()}`;

      const draft = {
        id: tempId,
        title: DEFAULT_TITLE,
        notes: '',
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        all_day: allDay,
        color: 'brand',
        _pending: true
      };

      setRows((prev) => [...prev, draft]);
      setError('');

      const { data, error: insertError } = await supabase
        .from('appointments')
        .insert({
          // user_id 显式带上：RLS 的 with check 要求它等于 auth.uid()，
          // 和 CommentThread 里写 user_id 是同一个道理。
          user_id: viewer.id,
          title: draft.title,
          starts_at: draft.starts_at,
          ends_at: draft.ends_at,
          all_day: draft.all_day,
          color: draft.color
        })
        .select(APPOINTMENT_COLUMNS)
        .single();

      if (insertError) {
        setRows((prev) => prev.filter((row) => row.id !== tempId));
        setError('新建失败，请重试。');
        return;
      }

      setRows((prev) => prev.map((row) => (row.id === tempId ? data : row)));
    },
    [viewer.id]
  );

  /**
   * 拖动改期 / 拉伸改时长。
   *
   * 界面已经被 FullCalendar 改好了，所以本地不动它 —— 失败时调 revert() 弹回去。
   */
  const handleEventTimesChanged = useCallback(async (event, revert) => {
    const supabase = createClient();
    const times = timesFromEvent(event);
    // 从时段网格拖到「全天」行时 allDay 会变，这个也要跟着存。
    const patch = { ...times, all_day: event.allDay, updated_at: new Date().toISOString() };

    const { data, error: updateError } = await supabase
      .from('appointments')
      .update(patch)
      .eq('id', event.id)
      .select('id');

    // 必须 .select() 回来数一数：RLS 让 update 一行都没匹配上时，supabase-js
    // 不会报错，只是返回空数组。不数的话「界面改了、库里没改」会一声不吭。
    if (updateError || !data?.length) {
      revert();
      setError('保存失败，已恢复到改动前。');
      return;
    }

    setError('');
    // 本地行也要跟上，否则下次从 rows 重建事件时会弹回旧时间。
    setRows((prev) =>
      prev.map((row) => (row.id === event.id ? { ...row, ...patch } : row))
    );
  }, []);

  const handleEventClick = useCallback((event) => setEditingId(event.id), []);

  const handleSave = useCallback(
    async (patch) => {
      if (!editing) return { error: '这条事项已经不存在了。' };
      // 乐观插入的行还没有真实 id，拿它去 update 会一行都匹配不上。
      // 窗口很短（插入通常不到一秒），但点到就是一条查无此行的 update。
      if (editing._pending) return { error: '这条还在保存中，请稍候。' };

      const supabase = createClient();
      const { data, error: updateError } = await supabase
        .from('appointments')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .select(APPOINTMENT_COLUMNS);

      if (updateError || !data?.length) return { error: '保存失败，请稍后重试。' };

      const saved = data[0];
      setRows((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      setError('');
      return { ok: true };
    },
    [editing]
  );

  const handleDelete = useCallback(async () => {
    if (!editing || editing._pending) return { error: '这条事项已经不存在了。' };

    const supabase = createClient();
    const { data, error: deleteError } = await supabase
      .from('appointments')
      .delete()
      .eq('id', editing.id)
      .select('id');

    if (deleteError || !data?.length) return { error: '删除失败，请稍后重试。' };

    setRows((prev) => prev.filter((row) => row.id !== editing.id));
    setError('');
    return { ok: true };
  }, [editing]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {error ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1">
        <ScheduleCalendar
          events={events}
          onSelectRange={handleSelectRange}
          onEventTimesChanged={handleEventTimesChanged}
          onEventClick={handleEventClick}
        />
      </div>

      <AppointmentEditor
        appointment={editing}
        open={Boolean(editing)}
        onOpenChange={(next) => {
          if (!next) setEditingId(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
