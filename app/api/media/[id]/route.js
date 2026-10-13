import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { canUpload } from '@/lib/roles';
import { deleteObjects } from '@/lib/oss-delete';

// 删除一条媒体：先删记录，再删 OSS 上的文件。
//
// 为什么删除要绕服务端，而上传不用：上传用的是按 uid 限死目录的临时凭证，
// 而删除是**管理动作** —— 任何管理员都能删任何一块砖（和数据库里
// media_delete_admin 的语义一致），浏览器手里那份凭证既没有 DeleteObject
// 权限，也不该有。长期 AK 只在服务端，所以这一步必须由服务端代劳。
export async function DELETE(_request, { params }) {
  const { id } = await params; // Next 16：params 是 Promise，必须 await

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  }
  if (!canUpload(claims.app_metadata?.role)) {
    return NextResponse.json({ error: '只有管理员可以删除。' }, { status: 403 });
  }

  // 先把两个对象键读出来 —— 记录一旦删掉就查不到了。
  // RLS 在这里同样生效：读不到就是没权限，后面也就删不了。
  const { data: row, error: readError } = await supabase
    .from('media')
    .select('id, storage_path, thumb_path')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: '读取记录失败。' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: '找不到这条记录。' }, { status: 404 });
  }

  // 顺序是刻意的：先删记录、后删文件。
  // 万一 OSS 删除失败，留下的是一份没人引用的孤儿对象 —— 看不见、之后能清。
  // 反过来则会留下一行指向不存在文件的记录，也就是一块明显坏掉的砖。
  const { error: deleteError } = await supabase.from('media').delete().eq('id', id);
  if (deleteError) {
    return NextResponse.json({ error: '删除记录失败。' }, { status: 500 });
  }

  const keys = [row.storage_path, row.thumb_path].filter(Boolean);
  let ossWarning = null;

  if (keys.length) {
    try {
      await deleteObjects(keys);
    } catch (error) {
      // 不因为清理失败就把整个删除判为失败 —— 记录已经删了，重试也没意义。
      ossWarning = `记录已删除，但 OSS 文件清理失败：${error?.message ?? '未知错误'}`;
    }
  }

  return NextResponse.json({ ok: true, warning: ossWarning });
}
