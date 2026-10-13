'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { ROLE_LABELS } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// 弹层不该进首屏 HTML，也没必要在服务端渲染 —— 它只在用户选完图片之后才存在。
// 同时把 react-easy-crop 和 lib/oss-client（连带整个 ali-oss）挡在服务端渲染之外。
const AvatarCropper = dynamic(() => import('@/components/profile/AvatarCropper'), { ssr: false });

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

// 填充式输入框，和留言框同一套语言：有「面」没有「线」。
// 聚焦时只把底色提亮一档，不加光圈 —— 表单里一排控件同时亮起边框会很吵。
const FIELD_CLASS =
  'h-11 border-transparent bg-muted shadow-none transition-colors focus-visible:border-transparent focus-visible:ring-0 focus-visible:bg-muted/70 dark:bg-muted dark:focus-visible:bg-muted/70';

// 站点主色，和 StaggeredMenu 的 colors 是同一对。
const BRAND_FROM = '#B497CF';
const BRAND_TO = '#5227FF';

const SectionLabel = ({ children, hint }) => (
  <div className="mb-6 flex items-baseline justify-between gap-6 border-b border-border/60 pb-2.5">
    <h2 className="text-[11px] tracking-[0.25em] text-muted-foreground">{children}</h2>
    {hint && <span className="text-[11px] tracking-wider text-muted-foreground/80">{hint}</span>}
  </div>
);

const ProfileForm = ({ userId, email, role, profile, contact }) => {
  const router = useRouter();
  const fileRef = useRef(null);

  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [address, setAddress] = useState(contact?.address ?? '');

  const [pickedFile, setPickedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
    : null;

  function handlePick(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 允许连续选同一个文件
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('图片太大，请选 20MB 以内的');
      return;
    }
    setError(null);
    setSaved(false);
    setPickedFile(file);
  }

  // 头像在裁剪确认的那一刻就落库了，不等下面的「保存」——
  // 用户刚裁完就想看到结果，攒着一起提交会让人以为没生效。
  //
  // 写库和清旧图都在 /api/profile/avatar 里完成了，这里只接收结果。
  function handleAvatarDone(url) {
    setPickedFile(null);
    setAvatarUrl(url);
    router.refresh();
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();

    try {
      // 公开字段
      const { error: nameError } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', userId);
      if (nameError) throw nameError;

      // 私有字段。第一次保存时行还不存在，所以用 upsert ——
      // profile_private 的 INSERT 和 UPDATE 策略都要求 id = auth.uid()。
      const { error: contactError } = await supabase
        .from('profile_private')
        .upsert(
          { id: userId, phone: phone.trim(), address: address.trim() },
          { onConflict: 'id' }
        );
      if (contactError) throw contactError;

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err?.message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-14 lg:grid-cols-[300px_1fr]">
        {/* 左：身份。桌面端跟着滚动停住，右栏再长也不用回头找自己是谁。 */}
        <aside className="flex flex-col items-center gap-7 lg:sticky lg:top-24 lg:items-start lg:self-start">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="更换头像"
            className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* 渐变描边而不是实心圈：一整圈紫色会把头像压住，2px 的环则只是框一下。 */}
            <span
              className="block rounded-full p-0.5"
              style={{ backgroundImage: `linear-gradient(135deg, ${BRAND_FROM}, ${BRAND_TO})` }}
            >
              <Avatar className="size-32 after:hidden">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                {/* 默认的 bg-muted + text-muted-foreground 在深色下是深灰压深灰，
                    首字母几乎看不见。提亮字色，再垫一层很淡的品牌色，
                    让「还没传头像」看起来是个状态而不是一块坏掉的图。 */}
                <AvatarFallback
                  className="text-3xl text-foreground/75"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${BRAND_FROM}26, ${BRAND_TO}33)`
                  }}
                >
                  {(displayName || '知')[0]}
                </AvatarFallback>
              </Avatar>
            </span>
            <span className="absolute inset-0.5 flex items-center justify-center rounded-full bg-black/55 text-xs tracking-[0.2em] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              更换
            </span>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handlePick}
          />

          <div className="w-full text-center lg:text-left">
            <p className="truncate text-xl font-semibold tracking-wide">
              {displayName || '未命名'}
            </p>
            {email && (
              <p className="mt-1.5 truncate text-xs tracking-wider text-muted-foreground">
                {email}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 lg:justify-start">
              <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] tracking-[0.15em] text-muted-foreground">
                {ROLE_LABELS[role] ?? role}
              </span>
              {joined && (
                <span className="text-[11px] tracking-wider text-muted-foreground/80">
                  {joined}加入
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* 右：表单。按「谁能看到」分成两段，而不是三个并排的输入框 —— 隐私边界
            是这一页真正要说的事，把它做成看得见的版块，胜过底下加一行小字。 */}
        <form onSubmit={handleSave} className="flex flex-col gap-12">
          <section>
            <SectionLabel hint="显示在相册和留言旁边">公开信息</SectionLabel>
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName" className="text-xs tracking-wider text-muted-foreground">
                用户名
              </Label>
              <Input
                id="displayName"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="显示在留言旁边的名字"
                className={FIELD_CLASS}
              />
            </div>
          </section>

          <section>
            <SectionLabel hint="只有你自己读得到">仅自己可见</SectionLabel>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone" className="text-xs tracking-wider text-muted-foreground">
                  手机号
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  maxLength={30}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="138 0000 0000"
                  className={FIELD_CLASS}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="address" className="text-xs tracking-wider text-muted-foreground">
                  家庭住址
                </Label>
                <Input
                  id="address"
                  value={address}
                  maxLength={200}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="省市 / 区县 / 街道"
                  className={FIELD_CLASS}
                />
              </div>

              <p className="text-[11px] leading-relaxed tracking-wider text-muted-foreground/80">
                这两项存在单独的一张表里，只有你自己能读到。相册和留言旁边显示的名字、
                头像来自另一张公开表。
              </p>
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-border/60 pt-6">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? '保存中…' : '保存'}
            </Button>
            {/* 状态单独一行、居中：按钮已经占满整宽，再往旁边塞字会被挤变形。 */}
            <p aria-live="polite" className="min-h-5 text-center text-sm">
              {error ? (
                <span className="text-destructive">{error}</span>
              ) : saved ? (
                <span className="text-muted-foreground">已保存</span>
              ) : null}
            </p>
          </div>
        </form>
      </div>

      {pickedFile && (
        <AvatarCropper
          file={pickedFile}
          userId={userId}
          onDone={handleAvatarDone}
          onCancel={() => setPickedFile(null)}
        />
      )}
    </>
  );
};

export default ProfileForm;
