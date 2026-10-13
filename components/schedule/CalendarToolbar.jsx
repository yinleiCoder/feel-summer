'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

// 月/周两个视图。type 必须和 FullCalendar 的视图名逐字一致 ——
// v7 起 changeView() 不再做别名匹配，写错只会静默不切换。
const VIEWS = [
  { type: 'dayGridMonth', label: '月' },
  { type: 'timeGridWeek', label: '周' }
];

/**
 * 自定义工具栏。
 *
 * 不用 FullCalendar 内置的 headerToolbar：v7 默认就把它关掉了，而且它由主题
 * 自绘，和站内 Button 对不齐。这里换成站内组件，日历只通过 controller 提供数据。
 */
export default function CalendarToolbar({ controller, title, viewType }) {
  // 日历挂载前 getButtonState() 返回的是 blankButtonState —— text 和 hint 都是空串
  // （见 @fullcalendar/react/public-api.js），并不会抛错。所以要给兜底文案，
  // 否则首帧会闪一个没有字的按钮，无障碍标签也是空的。
  const buttons = controller.getButtonState();
  const prev = buttons.prev ?? {};
  const next = buttons.next ?? {};
  const today = buttons.today ?? {};

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* 标题为空时留一个不断行的空格，避免日历挂载那一帧高度跳一下。 */}
      <h2 className="text-lg font-semibold tracking-[0.08em]">{title || ' '}</h2>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="视图切换"
          className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
        >
          {VIEWS.map((view) => {
            const active = viewType === view.type;
            return (
              <Button
                key={view.type}
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                aria-pressed={active}
                onClick={() => controller.changeView(view.type)}
              >
                {view.label}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={prev.hint || '上一页'}
            disabled={prev.isDisabled ?? false}
            onClick={() => controller.prev()}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => controller.today()}
          >
            {today.text || '今天'}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={next.hint || '下一页'}
            disabled={next.isDisabled ?? false}
            onClick={() => controller.next()}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
