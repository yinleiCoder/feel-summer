'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { BOARD_COLUMNS, TASK_COLUMNS } from '@/lib/kanban';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// 新建和编辑共用同一个弹窗。区分方式是 task.id：
//   null  -> 新建
//   有值  -> 编辑
const TaskDialog = ({ task, board, viewer, onClose, onSaved, onDeleted }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // 每次打开重置一次 —— 不重置的话会留着上一条的残留。
  useEffect(() => {
    if (!task) return;
    setTitle(task.title ?? '');
    setDescription(task.description ?? '');
    setError(null);
    setPending(false);
  }, [task]);

  // 关着的时候整个不渲染。
  //
  // 不是为了省事。原来写的是 `const isCreate = open && !task.id;`，靠 && 短路来
  // 避开 null —— 但 reactCompiler 会把形如 !task.id 的表达式当纯函数提前求值做
  // 记忆化，短路就保不住了，运行时直接抛
  //   TypeError: Cannot read properties of null (reading 'id')
  // 于是整个 /kanban 变成「This page couldn't load」。
  //
  // 与其逐处补 `?.`，不如让这个组件在关闭时压根不存在 —— 里面任何一行都不可能
  // 再拿到 null。hooks 必须在提前 return 之前调用，所以顺序是这样。
  if (!task) return null;

  const isCreate = !task.id;

  async function handleSave(event) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('标题不能为空。');
      return;
    }

    setPending(true);
    setError(null);
    const supabase = createClient();

    // 写库直接走浏览器客户端：RLS 提供的保护和绕一趟服务端是一样的，
    // 而拖拽/编辑要的是即时反馈。和 /schedule 的选择保持一致。
    const query = isCreate
      ? supabase
          .from('tasks')
          // 不传 position：交给 tasks_assign_position 触发器排到这一栏末尾。
          .insert({
            board,
            status: task.status,
            title: trimmed,
            description: description.trim(),
            created_by: viewer.id
          })
      : supabase
          .from('tasks')
          .update({ title: trimmed, description: description.trim() })
          .eq('id', task.id);

    const { data, error: saveError } = await query.select(TASK_COLUMNS).single();
    setPending(false);

    if (saveError) {
      setError('保存失败，请稍后重试。');
      return;
    }
    onSaved(data, isCreate ? 'create' : 'edit');
  }

  async function handleDelete() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id);
    setPending(false);

    if (deleteError) {
      setError('删除失败，请稍后重试。');
      return;
    }
    onDeleted(task.id);
  }

  return (
    // open 恒为 true：关着的时候上面已经 return null 了，这里根本没有「关着的」状态。
    // （原来写的是 open={open}，但组件里从来没有 open 这个变量 —— 服务端渲染时是
    //  ReferenceError，浏览器里则会悄悄取到 window.open，一个真值。碰巧能跑，但不能留。）
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="w-[min(94vw,560px)] max-w-none sm:max-w-none">
        <DialogTitle>{isCreate ? '新建任务' : '编辑任务'}</DialogTitle>
        <DialogDescription className="sr-only">
          {isCreate ? '填写标题和说明，保存后出现在这一栏末尾。' : '修改标题和说明。'}
        </DialogDescription>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {isCreate && (
            <p className="text-[11px] tracking-wider text-muted-foreground">
              将加入「
              {BOARD_COLUMNS.find((c) => c.key === task.status)?.label}
              」栏
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-title">标题</Label>
            <Input
              id="task-title"
              value={title}
              maxLength={200}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder="要做什么"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-description">说明</Label>
            <Textarea
              id="task-description"
              value={description}
              rows={5}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选"
            />
          </div>

          <p aria-live="polite" className="min-h-5 text-sm text-destructive">
            {error}
          </p>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? '保存中…' : '保存'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              取消
            </Button>
            {!isCreate && (
              <Button
                type="button"
                variant="destructive"
                className="ml-auto"
                onClick={handleDelete}
                disabled={pending}
              >
                删除
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDialog;
