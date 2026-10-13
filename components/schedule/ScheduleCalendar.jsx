'use client';

// 全站唯一 import FullCalendar 的模块。它必须被 next/dynamic(..., { ssr: false })
// 包住，理由和 components/album/PhotoGallery.jsx 里记的是同一个：
// FullCalendar 要算「今天」，内部会碰 Date.now()，而 next.config.mjs 开了
// cacheComponents —— 预渲染阶段遇到不稳定取值会把整条路由判成阻塞路由，构建直接失败。
//
// 工具栏也留在这个模块里，不是随手放的：useCalendarController() 是从
// '@fullcalendar/react' 导出的，挪到父组件去调就等于把整个包拉回服务端包里，
// 上面那个坑会原样复现。

import { useCallback, useState } from 'react';

import FullCalendar, { useCalendarController } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import zhCnLocale from '@fullcalendar/react/locales/zh-cn';

import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
// 官方 palette.css 故意不引 —— 由这份 fork 取代，原因见该文件头部。
import './schedule.css';

import CalendarToolbar from '@/components/schedule/CalendarToolbar';
import { useThemeStore } from '@/lib/store/theme-store-provider';

// 提到模块级：v7 的 props 是响应式的，每次渲染现造一个数组会让插件表看起来一直在变。
// timegrid 负责周视图，interaction 提供框选/拖动/拉伸三种交互。
const PLUGINS = [classicThemePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin];

const INITIAL_VIEW = 'dayGridMonth';

export default function ScheduleCalendar({
  events,
  onSelectRange,
  onEventTimesChanged,
  onEventClick
}) {
  // 站内主题只有 'dark' | 'light'，正好是 colorScheme 接受的两个值。
  const theme = useThemeStore((state) => state.theme);
  const controller = useCalendarController();

  // 标题和当前视图走 state，不直接读 controller.view：
  // controller.view 的类型是 ViewApi | undefined（挂载前就是 undefined），
  // 首帧去读会炸。datesSet 每次日期或视图变化都会触发（controller 内部也是
  // 靠它来重渲染的），从这里写 state 既稳，又顺手拿到了当前视图做高亮。
  const [title, setTitle] = useState('');
  const [viewType, setViewType] = useState(INITIAL_VIEW);

  const handleDatesSet = useCallback((info) => {
    setTitle(info.view.title);
    setViewType(info.view.type);
  }, []);

  const handleSelect = useCallback(
    (info) => {
      // 先清掉视觉选区。紧接着乐观插入的那条事项会顶上来，
      // 不清的话松开鼠标后高亮和事件会重叠一瞬。
      info.view.calendar.unselect();
      onSelectRange({ start: info.start, end: info.end, allDay: info.allDay });
    },
    [onSelectRange]
  );

  // 拖动改期和拉伸改时长落到同一个回调：两者要写回库的东西完全一样
  // （起始 + 结束时间），失败时的回滚也一样，没必要分成两条路。
  const handleEventTimesChanged = useCallback(
    (info) => onEventTimesChanged(info.event, info.revert),
    [onEventTimesChanged]
  );

  const handleEventClick = useCallback(
    (info) => onEventClick(info.event),
    [onEventClick]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <CalendarToolbar controller={controller} title={title} viewType={viewType} />

      {/* data-lenis-prevent 是 Lenis 自带的白名单：它检查的是整条 composedPath，
          所以挂在容器上就能让里面所有元素的滚轮事件跳过 Lenis、交给周视图自己的
          内层滚动容器。比往 SmoothScroll 的全局 prevent 谓词里再加一条更收敛 ——
          这个需求只属于本页，不该改全站的滚动行为。 */}
      <div className="schedule-calendar min-h-0 flex-1" data-lenis-prevent>
        <FullCalendar
          controller={controller}
          plugins={PLUGINS}
          initialView={INITIAL_VIEW}
          locale={zhCnLocale}
          colorScheme={theme}
          events={events}
          // v7 默认就不渲染工具栏，显式关掉是为了表明这里有意的选择。
          headerToolbar={false}
          height="100%"
          // 刻意不开 expandRows：开了的话 24 小时会被压进容器高度里，一小时只剩
          // 二十来像素，半小时的事项根本读不出来。让时段保持固定高度、由周视图
          // 内部滚动，再配合 scrollTime 直接停在早上 8 点。
          // 代价是内层滚动容器会和 Lenis 抢滚轮，所以容器上挂了 data-lenis-prevent。
          // 三种交互：框选新建、拖动改期、拉底边改时长。
          selectable
          selectMirror
          editable
          eventResizableFromStart
          dayMaxEvents
          nowIndicator
          // 拖动按 15 分钟吸附，不然会拖出 09:07 这种时间。
          snapDuration="00:15:00"
          // 周视图打开时直接滚到早上 8 点，而不是从零点开始翻。
          scrollTime="08:00:00"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          datesSet={handleDatesSet}
          select={handleSelect}
          eventDrop={handleEventTimesChanged}
          eventResize={handleEventTimesChanged}
          eventClick={handleEventClick}
        />
      </div>
    </div>
  );
}
