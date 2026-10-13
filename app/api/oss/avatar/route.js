import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { assumeAvatarRole, missingServerOssEnv } from '@/lib/oss';
import { OSS_BUCKET, OSS_ORIGIN, OSS_REGION } from '@/lib/oss-config';

// 签发头像上传凭证。
//
// 和 /api/oss/sts 的区别只有授权级别：那边要求 admin（相册是内容管理），
// 这边只要登录（头像是每个人自己的）。两处都遵守同一条规矩 ——
// uid 取自服务端验证过的 claims，绝不读请求体。
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return NextResponse.json({ error: '请先登录。' }, { status: 401 });
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
    const credentials = await assumeAvatarRole(claims.sub);

    return NextResponse.json({
      credentials,
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      origin: OSS_ORIGIN
    });
  } catch (error) {
    return NextResponse.json(
      { error: `签发上传凭证失败：${error?.message ?? '未知错误'}` },
      { status: 502 }
    );
  }
}
