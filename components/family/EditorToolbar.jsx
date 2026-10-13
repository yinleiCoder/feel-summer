'use client';

import {
  AlertTriangle,
  Check,
  Loader2,
  Maximize2,
  Redo2,
  Undo2,
  UserPlus,
  Wand2
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { KIND, KIND_LABELS } from '@/lib/family/model';

// 画布上「拖一条线」到底是什么关系，由这里决定。
// 让用户先声明意图、再动手，比事后猜他连的是父子还是夫妻要可靠得多 ——
// 同一条线在两种关系下长得一模一样，猜错了就是静默写错数据。
const LINK_MODES = [KIND.PARENT, KIND.SPOUSE, KIND.SIBLING];

const TOOL_BUTTON =
  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none';

function SaveChip({ saveState, onSave }) {
  const { status, at, message } = saveState;

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onSave}
        className="flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1 text-[11px] tracking-wider text-destructive transition-colors hover:bg-destructive/10"
      >
        <AlertTriangle className="size-3.5" />
        {message || '保存失败'} · 重试
      </button>
    );
  }

  if (status === 'conflict') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1 text-[11px] tracking-wider text-destructive">
        <AlertTriangle className="size-3.5" />
        别处改过了
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-[11px] tracking-wider text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        保存中…
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-[11px] tracking-wider text-muted-foreground">
        <Check className="size-3.5 text-brand" />
        已保存{at ? ` ${at}` : ''}
      </span>
    );
  }

  // 'new'：还没落过库，而且画布上确实还没有东西可存。
  if (status === 'new') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-[11px] tracking-wider text-muted-foreground/80">
        尚无内容
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/8 px-3 py-1 text-[11px] tracking-wider text-brand">
      未保存
    </span>
  );
}

export default function EditorToolbar({
  linkMode,
  onLinkModeChange,
  onAddPerson,
  onTidy,
  onFitView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saveState,
  onSave,
  dirty,
  disabled
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-6 py-2.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAddPerson}
        disabled={disabled}
        className="gap-1.5"
      >
        <UserPlus className="size-3.5" />
        添加成员
      </Button>

      {/* 连线模式 */}
      <div
        role="group"
        aria-label="连线模式"
        className="flex items-center rounded-md border border-border/70 p-0.5"
      >
        {LINK_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={linkMode === mode}
            onClick={() => onLinkModeChange(mode)}
            className={cn(
              'rounded px-2.5 py-1 text-[11px] tracking-wider transition-colors',
              linkMode === mode
                ? 'bg-brand/15 text-brand'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {KIND_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        <button type="button" className={TOOL_BUTTON} title="自动整理" aria-label="自动整理" onClick={onTidy} disabled={disabled}>
          <Wand2 className="size-4" />
        </button>
        <button type="button" className={TOOL_BUTTON} title="适应视图" aria-label="适应视图" onClick={onFitView} disabled={disabled}>
          <Maximize2 className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5">
        <button type="button" className={TOOL_BUTTON} title="撤销" aria-label="撤销" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </button>
        <button type="button" className={TOOL_BUTTON} title="重做" aria-label="重做" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </button>
      </div>

      {/* 状态常驻而不是弹一下就没：这个页面是开在新标签页里的，
          用户需要「看一眼就知道能不能关掉」。 */}
      <div className="ml-auto flex items-center gap-2" aria-live="polite">
        <SaveChip saveState={saveState} onSave={onSave} />
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          // 没有未保存的改动时按钮就该是灰的 —— 一个永远亮着的「保存」
          // 会让人以为自动保存没在工作。出错时例外，那时它是「重试」。
          disabled={disabled || saveState.status === 'saving' || !(dirty || saveState.status === 'error')}
        >
          保存
        </Button>
      </div>
    </div>
  );
}
