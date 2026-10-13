'use client';

import { useEffect, useRef } from 'react';
import { Trash2, UserRoundCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  GENDERS,
  GENDER_LABELS,
  KIND,
  KIND_LABELS,
  RELATION_SUGGESTIONS
} from '@/lib/family/model';
import { KINSHIP, KINSHIP_LABELS, kinshipTo } from '@/lib/family/lineage';

// 直系的三种关系（往上、往下、配偶）在界面上用同一种强调色。
const LINEAL_KINSHIPS = new Set([KINSHIP.ANCESTOR, KINSHIP.DESCENDANT, KINSHIP.SPOUSE]);

// 和资料页表单同一套输入框语言：有「面」没有「线」，聚焦只提亮底色。
const FIELD_CLASS =
  'border-transparent bg-muted shadow-none transition-colors focus-visible:border-transparent focus-visible:ring-0 focus-visible:bg-muted/70 dark:bg-muted dark:focus-visible:bg-muted/70';

const RELATION_KINDS = [KIND.PARENT, KIND.SPOUSE, KIND.SIBLING];

const SectionLabel = ({ children }) => (
  <h3 className="mb-4 border-b border-border/60 pb-2 text-[11px] tracking-[0.25em] text-muted-foreground">
    {children}
  </h3>
);

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <Label className="text-[11px] tracking-wider text-muted-foreground">{label}</Label>
    {children}
  </div>
);

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-md border border-border/70 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded px-2.5 py-1.5 text-xs tracking-wider transition-colors',
            value === option.value
              ? 'bg-brand/15 text-brand'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="text-[11px] tracking-[0.3em] text-muted-foreground/80">INSPECTOR</span>
      <p className="text-xs leading-relaxed text-muted-foreground/80">
        选中一个人或一条关系来编辑。
        <br />
        选中某个人之后，他头顶会出现添加父母、配偶、子女和兄弟姐妹的按钮。
      </p>
    </div>
  );
}

export default function PersonInspector({
  graph,
  selection,
  onUpdatePerson,
  onDeletePerson,
  onSetSelf,
  onUpdateRelation,
  onDeleteRelation,
  focusId,
  error,
  disabled
}) {
  const nameRef = useRef(null);
  const focusedFor = useRef(null);

  // 只在「刚刚新建了这个人」的时候把光标送进姓名框，用户自己点选节点时绝不抢焦点。
  //
  // 之前这里用的是 autoFocus 属性，结果是：点一下某个节点，焦点被吸进姓名输入框，
  // 接着按 Delete 就被当成在名字里删字 —— 节点删不掉，名字还悄悄少了一个字。
  // React Flow 的删除键在输入框里是故意不响应的，所以这不是 React Flow 的问题，
  // 是面板不该在用户没要打字的时候把焦点拿走。
  useEffect(() => {
    if (!focusId || focusId !== selection?.id) {
      focusedFor.current = null;
      return;
    }
    if (focusedFor.current === focusId) return;
    focusedFor.current = focusId;
    nameRef.current?.focus();
  }, [focusId, selection?.id]);

  if (!selection) return <EmptyPanel />;

  if (selection.type === 'relation') {
    const relation = graph.edges.find((edge) => edge.id === selection.id);
    if (!relation) return <EmptyPanel />;

    return (
      <div className="flex h-full flex-col gap-8 overflow-y-auto p-6">
        <section>
          <SectionLabel>关系</SectionLabel>
          <Field label="类型">
            <Segmented
              label="关系类型"
              value={relation.kind}
              onChange={(kind) => onUpdateRelation(relation.id, { kind })}
              options={RELATION_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
            />
          </Field>
          <p className="mt-3 text-[11px] leading-relaxed tracking-wider text-muted-foreground/80">
            {relation.kind === KIND.PARENT
              ? '箭头从父母指向子女。'
              : '配偶和兄弟姐妹没有方向，两个方向都成立。'}
          </p>
        </section>

        {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}

        <Button
          type="button"
          variant="outline"
          onClick={() => onDeleteRelation(relation.id)}
          disabled={disabled}
          className="mt-auto gap-1.5 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          删除这条关系
        </Button>
      </div>
    );
  }

  const person = graph.nodes.find((node) => node.id === selection.id);
  if (!person) return <EmptyPanel />;

  const kinship = kinshipTo(graph, person.id);

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-6">
      <section>
        <SectionLabel>这个人</SectionLabel>
        <div className="flex flex-col gap-5">
          <Field label="姓名">
            <Input
              ref={nameRef}
              value={person.name}
              maxLength={40}
              placeholder="姓名"
              onChange={(event) => onUpdatePerson(person.id, { name: event.target.value })}
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="称谓">
            <Input
              value={person.relation}
              maxLength={20}
              list="family-relation-suggestions"
              placeholder="父亲 / 姥姥 / 配偶…"
              onChange={(event) => onUpdatePerson(person.id, { relation: event.target.value })}
              className={FIELD_CLASS}
            />
          </Field>
          {/* 只是建议，不是枚举 —— 方言里的叫法（姥姥、姥爷、阿爸）
              比标准称谓更常出现在自家人的关系图里。 */}
          <datalist id="family-relation-suggestions">
            {RELATION_SUGGESTIONS.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>

          <Field label="性别">
            <Segmented
              label="性别"
              value={person.gender}
              onChange={(gender) => onUpdatePerson(person.id, { gender })}
              options={GENDERS.map((gender) => ({ value: gender, label: GENDER_LABELS[gender] }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="出生">
              <Input
                type="date"
                value={person.birth ?? ''}
                onChange={(event) => onUpdatePerson(person.id, { birth: event.target.value || null })}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="逝世">
              <Input
                type="date"
                value={person.death ?? ''}
                onChange={(event) => onUpdatePerson(person.id, { death: event.target.value || null })}
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <Field label="头像链接">
            <Input
              value={person.avatarUrl ?? ''}
              placeholder="https://…"
              onChange={(event) =>
                onUpdatePerson(person.id, { avatarUrl: event.target.value.trim() || null })
              }
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="备注">
            <Textarea
              value={person.note}
              maxLength={500}
              rows={3}
              placeholder="籍贯、职业、想记的事…"
              onChange={(event) => onUpdatePerson(person.id, { note: event.target.value })}
              className={cn(FIELD_CLASS, 'min-h-20 resize-y')}
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionLabel>与我的关系</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] tracking-wider',
              person.isSelf
                ? 'border-transparent bg-linear-to-br from-[#B497CF] to-[#5227FF] text-white'
                : LINEAL_KINSHIPS.has(kinship)
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-border/70 text-muted-foreground'
            )}
          >
            {person.isSelf ? '本人' : KINSHIP_LABELS[kinship]}
          </span>
          {!person.isSelf && kinship !== 'unrelated' && (
            <span className="text-[11px] tracking-wider text-muted-foreground/80">
              直系主干会自动点亮
            </span>
          )}
        </div>

        {!person.isSelf && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSetSelf(person.id)}
            disabled={disabled}
            className="mt-4 w-full gap-1.5"
          >
            <UserRoundCheck className="size-3.5" />
            把这个人标记为我
          </Button>
        )}
      </section>

      {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}

      <div className="mt-auto flex flex-col gap-2 border-t border-border/60 pt-5">
        <p className="text-[11px] leading-relaxed tracking-wider text-muted-foreground/80">
          用这个人头顶的按钮添加亲戚，或者从画布上拖手柄连线。
        </p>
        {person.isSelf ? (
          <p className="text-[11px] tracking-wider text-muted-foreground/80">
            「我」不能被删除 —— 直系高亮整套逻辑都挂在这个节点上。
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => onDeletePerson(person.id)}
            disabled={disabled}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            删除这个人
          </Button>
        )}
      </div>
    </div>
  );
}
