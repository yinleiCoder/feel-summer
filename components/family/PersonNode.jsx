'use client';

import { memo } from 'react';
import { Handle, NodeToolbar, Position } from '@xyflow/react';
import { ChevronsDown, ChevronsUp, Heart, Trash2, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { RELATIVE, RELATIVE_LABELS, NODE_WIDTH, NODE_HEIGHT } from '@/lib/family/model';
import { useFamilyEditor } from './editor-context';

// 上下各一个（父母在上、子女在下），左右各两个。
//
// 左右必须是**两个**重叠的手柄，一个 source 一个 target：横向的关系
// （配偶、兄弟姐妹）在画布上哪个人在左是随用户拖动的，所以一条边既可能
// 从左边那个人的右侧出发，也可能反过来。React Flow 画边时会按
// 「节点 id + 手柄 id + 类型」去查手柄位置，查不到就**静默不画这条边** ——
// 只放一个手柄的话，总有一半的横向关系会消失，而且不报任何错。
//
// ConnectionMode 是 loose，所以重叠的两个手柄不会互相妨碍：
// 从任一边都能发起连线。
const HANDLES = [
  { id: 'top', type: 'target', position: Position.Top },
  { id: 'bottom', type: 'source', position: Position.Bottom },
  { id: 'left-src', type: 'source', position: Position.Left },
  { id: 'left-tgt', type: 'target', position: Position.Left },
  { id: 'right-src', type: 'source', position: Position.Right },
  { id: 'right-tgt', type: 'target', position: Position.Right }
];

// 顺序按辈分从上到下排，和它们在图上的方向一致：父母在上、配偶在旁、子女在下。
const QUICK_ACTIONS = [
  { kind: RELATIVE.PARENT, Icon: ChevronsUp },
  { kind: RELATIVE.SPOUSE, Icon: Heart },
  { kind: RELATIVE.CHILD, Icon: ChevronsDown },
  { kind: RELATIVE.SIBLING, Icon: Users }
];

// 性别只影响头像底色。三种都是用品牌色的不同浓淡，不引入第二种颜色 ——
// 一张图里同时出现蓝粉紫三种色相，读起来会像是三种不同的状态。
const AVATAR_TINT = {
  male: 'from-[#5227FF]/18 to-[#5227FF]/5',
  female: 'from-[#B497CF]/32 to-[#5227FF]/10',
  unknown: 'from-[#B497CF]/20 to-[#5227FF]/12'
};

function lifeSpan(birth, death) {
  if (birth && death) return `${birth.slice(0, 4)}–${death.slice(0, 4)}`;
  if (birth) return `${birth.slice(0, 4)} 年生`;
  if (death) return `${death.slice(0, 4)} 年卒`;
  return null;
}

function PersonNode({ id, data, selected }) {
  const { addRelative, select, removePerson } = useFamilyEditor();
  const { person, lineal } = data;
  const span = lifeSpan(person.birth, person.death);
  const subtitle = [person.relation || null, span].filter(Boolean).join(' · ');

  return (
    <>
      {/* 选中时浮在节点上方的四个快捷动作。这是建图的主要路径 ——
          比让用户去拖手柄快得多，手柄那条路留着给「把已经存在的两个人连起来」。 */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <div className="family-glass flex items-center gap-1 rounded-full p-1 shadow-lg">
          {QUICK_ACTIONS.map(({ kind, Icon }) => {
            const label = RELATIVE_LABELS[kind];
            return (
              <button
                key={kind}
                type="button"
                title={label}
                aria-label={label}
                onClick={(event) => {
                  event.stopPropagation();
                  addRelative(id, kind);
                }}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-brand/15 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <Icon className="size-4" />
              </button>
            );
          })}

          {/* 删除也放在节点上，而不是只藏在右侧面板里 —— 「怎么删掉多余的人」
              是这个功能最先被问到的问题，不该需要先想到去看面板。
              没有二次确认：撤销栈就在工具栏上，删错了 Ctrl+Z 就回来了。 */}
          {!person.isSelf && (
            <>
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                title="删除这个人"
                aria-label="删除这个人"
                onClick={(event) => {
                  event.stopPropagation();
                  removePerson(id);
                }}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </NodeToolbar>

      <div
        role="button"
        tabIndex={0}
        aria-label={`${person.name || '未命名'}${person.relation ? `，${person.relation}` : ''}${lineal ? '，直系亲属' : ''}`}
        onClick={() => select({ type: 'person', id })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select({ type: 'person', id });
          }
        }}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
            'bg-card/85 backdrop-blur-[2px]',
          // 三种状态靠边框和光晕区分，不靠填充色 —— 卡片一旦染上颜色，
          // 里面的字就开始难读，而这张图上字才是内容。
          lineal
            ? 'border-brand/55 ring-1 ring-brand/20 shadow-[0_8px_24px_-14px_var(--brand-accent)]'
            : 'border-border/70',
          selected && 'border-brand ring-2 ring-brand/40',
          'focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none'
        )}
        style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      >
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br text-sm font-medium text-foreground/80',
            AVATAR_TINT[person.gender] ?? AVATAR_TINT.unknown,
            // 本人再套一圈渐变描边，和资料页头像用的是同一对手感
            person.isSelf && 'ring-2 ring-[#5227FF] ring-offset-2 ring-offset-card'
          )}
        >
          {person.avatarUrl ? (
            // 头像是用户自己填的外链，用原生 img 而不是 next/image：
            // 域名不可枚举，配 remotePatterns 等于给任意来源开口子。
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            (person.name || '？').slice(0, 1)
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium',
              person.death && 'text-muted-foreground'
            )}
          >
            {person.name || '未命名'}
          </span>
          {subtitle && (
            <span className="mt-0.5 block truncate text-[11px] tracking-wide text-muted-foreground/80">
              {subtitle}
            </span>
          )}
        </span>

        {person.isSelf ? (
          <span className="absolute -top-2 -right-2 rounded-full bg-linear-to-br from-[#B497CF] to-[#5227FF] px-2 py-0.5 text-[10px] font-medium tracking-wider text-white shadow-sm">
            我
          </span>
        ) : (
          lineal && (
            // 直系的小菱形。边在流动、卡片带光晕，再加一个记号是为了让人
            // 在这张图被截图、或者动画被系统关掉之后，仍然分得清谁是谁。
            <span
              title="直系亲属"
              className="absolute -top-1.5 -right-1.5 size-2.5 rotate-45 rounded-xs bg-brand shadow-sm"
            />
          )
        )}
      </div>

      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          // 两个方向都放开：loose 模式下拖拽本来就不看类型，
          // 这里再显式打开，是为了让「从任意一个手柄开始拖」都成立。
          isConnectableStart
          isConnectableEnd
        />
      ))}
    </>
  );
}

export default memo(PersonNode);
