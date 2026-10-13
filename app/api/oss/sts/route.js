import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { canUpload } from '@/lib/roles';
import { assumeUploadRole, missingServerOssEnv } from '@/lib/oss';
import { OSS_BUCKET, OSS_ORIGIN, OSS_REGION } from '@/lib/oss-config';

// 用长期 AK 换一份临时上传凭证。
//
// 这是搬到 OSS 之后新增的**授权关口** —— 原来 storage.objects 上的 RLS 策略
// 决定了谁能往哪个目录写，OSS 没有等价物，所以这个路由必须自己把好关：
//   1. 调用者得是登录用户（身份取自服务端验证过的 claims）；
//   2. 角色得是 admin / super_admin；
//   3. 签发的凭证只能写 {uid}/*，uid 来自 claims 而不是请求体。
//
// 第 3 条尤其要紧：如果 uid 从客户端读，任何登录用户都能给自己签发
// 别人目录的写权限，等于没有授权。
export async function POST() {
  const supabase = await createClient();

  // getClaims()：服务端唯一可信的身份来源。不用 getSession()（不验签）。
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  }

  const role = claims.app_metadata?.role ?? 'user';
  if (!canUpload(role)) {
    return NextResponse.json({ error: '只有管理员可以上传。' }, { status: 403 });
  }

  const missing = missingServerOssEnv();
  const publicMissing = !OSS_ORIGIN ? ['NEXT_PUBLIC_OSS_BUCKET / NEXT_PUBLIC_OSS_REGION'] : [];
  const allMissing = [...missing, ...publicMissing];

  if (allMissing.length) {
    return NextResponse.json(
      { error: `OSS 还没配置完整，缺少：${allMissing.join('、')}（见 .env.local）` },
      { status: 503 }
    );
  }

  try {
    const credentials = await assumeUploadRole(claims.sub);

    return NextResponse.json({
      credentials,
      // 回传一份，省得客户端再读一次环境变量，也方便自建域名的情况。
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      origin: OSS_ORIGIN
    });
  } catch (error) {
    // 不把 STS 的原始响应整个抛给浏览器，但保留 message —— 配置期需要它来定位。
    return NextResponse.json(
      { error: `签发上传凭证失败：${error?.message ?? '未知错误'}` },
      { status: 502 }
    );
  }
}
