import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { deleteObjects } from '@/lib/oss-delete';
import { OSS_ORIGIN } from '@/lib/oss-config';

// 换头像。客户端把裁好的图传上 OSS 之后调这里，由服务端完成「写库 + 删旧图」。
//
// 为什么不让客户端直接 update profiles.avatar_url：
//   1. 删旧图需要长期 AK（浏览器手里那份临时凭证没有 DeleteObject 权限）；
//   2. 「旧图是哪一个」必须由服务端从库里读，不能信客户端传上来的值 ——
//      否则任何人都能指定删掉别人的对象。
export async function POST(request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  }

  if (!OSS_ORIGIN) {
    return NextResponse.json({ error: 'OSS 还没配置完整（见 .env.local）' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const key = body?.key;

  // 新对象必须落在调用者自己的头像目录下。不校验的话，用户可以把自己的
  // avatar_url 指向别人的对象，也能让下面那段清理去删任意 key。
  const prefix = `${claims.sub}/avatar/`;
  if (typeof key !== 'string' || !key.startsWith(prefix)) {
    return NextResponse.json({ error: '非法的对象路径。' }, { status: 400 });
  }

  // 先读旧值，再写新值 —— 写完就查不到「上一个头像是哪个」了。
  const { data: current } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', claims.sub)
    .maybeSingle();

  const avatarUrl = `${OSS_ORIGIN}/${key}`;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', claims.sub);

  if (updateError) {
    // 客户端已经把新图传上去了；这次写库失败的话它就没人引用了。
    // 顺手清掉，免得每失败一次就多一个孤儿。
    await deleteObjects([key]).catch(() => {});
    return NextResponse.json({ error: '保存头像失败。' }, { status: 500 });
  }

  // 顺序和删除相册时一致：先改记录、后删文件。
  // 万一 OSS 删除失败，留下的是一份没人引用的孤儿对象 —— 看不见、之后能清；
  // 反过来则会留下一行指向不存在文件的记录，也就是一个坏掉的头像。
  const oldKey = keyFromUrl(current?.avatar_url);
  let warning = null;

  if (oldKey && oldKey !== key && oldKey.startsWith(prefix)) {
    try {
      await deleteObjects([oldKey]);
    } catch (error) {
      warning = `头像已更新，但旧文件清理失败：${error?.message ?? '未知错误'}`;
    }
  }

  return NextResponse.json({ avatarUrl, warning });
}

/**
 * 从公开 URL 反推对象键，且只认自己这套 origin。
 * 库里的值理论上都是我们自己写进去的，但仍要挡住外部 URL 和拼错的值 ——
 * 这个函数的返回值会直接喂给删除操作。
 */
function keyFromUrl(url) {
  if (typeof url !== 'string' || !OSS_ORIGIN) return null;
  const marker = `${OSS_ORIGIN}/`;
  if (!url.startsWith(marker)) return null;
  const key = url.slice(marker.length);
  // 带查询串的（比如加过 x-oss-process）不是对象键本身，不动它。
  return key && !key.includes('?') ? key : null;
}
