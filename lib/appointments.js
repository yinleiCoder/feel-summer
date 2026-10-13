// 预约数据层：列集合、颜色表、行与 FullCalendar 事件对象之间的换算。
//
// 服务端首屏和客户端写库共用这一份，两边就不可能对时间语义或列集合产生分歧。

export const DEFAULT_TITLE = '新事项';

/**
 * 事件配色。键存库，色值只活在代码里。
 *
 * 存字面量而不是 var(--brand-accent)：FullCalendar 会把颜色内联到事件元素上，
 * 拖动时复制出来的拖拽镜像还会被挂到 <body> 下。用字面量就少一层
 * 「这个变量在那一层有没有定义」的心智负担。
 *
 * brand 取的是 --brand-accent 在深色下那一档（#8b7bff）—— 浅色主题下
 * #5227ff 压在深色事件底上反而发闷，而站点实际长期跑在深色。
 */
export const EVENT_COLORS = {
  brand: '#8b7bff',
  sky: '#38bdf8',
  amber: '#fbbf24',
  rose: '#fb7185',
  emerald: '#34d399'
};

export const COLOR_KEYS = Object.keys(EVENT_COLORS);

export const APPOINTMENT_COLUMNS = 'id,title,notes,starts_at,ends_at,all_day,color';

// 一次性把用户的预约全取回来，翻月份/翻周不再请求。
// 这是个人日程，量级是几百条；上限只是防止某个账号异常增长把首屏拖垮。
const FETCH_LIMIT = 2000;

/**
 * 当前用户的全部预约，按开始时间升序。
 *
 * 不按时间范围过滤：日历可以在月/周之间来回切、可以翻到任意月份，
 * 每次切视图都回一次库既慢又会让「刚拖完的那条」在切视图时闪一下。
 */
export async function fetchAppointments(supabase) {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .order('starts_at', { ascending: true })
    .limit(FETCH_LIMIT);

  if (error) throw error;
  return data ?? [];
}

/**
 * 事件结束时间。EventApi.end 的类型是 Date | null。
 *
 * 理论上取不到 null：本页创建的每条预约都同时写 starts_at 和 ends_at，
 * 而两列都是 NOT NULL，所以读回来的事件必然有 end。留这个兜底纯粹是因为
 * ends_at > starts_at 是表上的 check 约束 —— 真塞一个 null 进去，
 * 写库会整体失败并被 info.revert() 弹回，用户会看到「拖了但没动」却不知道为什么。
 */
export const eventEnd = (event) => {
  if (event.end) return event.end;
  const ms = event.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(event.start.getTime() + ms);
};

/**
 * 数据库行 -> FullCalendar 事件对象。
 *
 * starts_at / ends_at 原样透传：库里存的 ends_at 本来就是**排他**的
 * （9:00–10:00 的预约存 end = 10:00），和 FullCalendar 的约定完全一致，
 * 中间不需要任何加减，也就不会有「全天事项跨时区差一天」这类经典问题。
 */
export const toCalendarEvent = (row) => ({
  id: row.id,
  title: row.title,
  start: row.starts_at,
  end: row.ends_at,
  allDay: row.all_day,
  color: EVENT_COLORS[row.color] ?? EVENT_COLORS.brand,
  // 乐观插入、还没拿到真实 id 的行压成半透明，见 components/schedule/schedule.css
  className: row._pending ? 'apt-pending' : undefined,
  extendedProps: { notes: row.notes ?? '' }
});

/** 拖动/拉伸之后，从事件对象取出要写回库的两个时间。 */
export const timesFromEvent = (event) => ({
  starts_at: event.start.toISOString(),
  ends_at: eventEnd(event).toISOString()
});
