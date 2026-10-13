import 'server-only';

import OSS from 'ali-oss';

import { assumeDeleteRole } from '@/lib/oss';
import { OSS_BUCKET, OSS_REGION } from '@/lib/oss-config';

// 删 OSS 对象的共用实现。
//
// 单独一个模块，而不是把 deleteObjects 加进 lib/oss.js —— 后者会踩到 dev 上的一个
// Turbopack 问题：往一个已存在的模块里新增导出、再从一个新路由 import 它，
// 新路由会绑到那份陈旧副本上，运行时报「xxx is not a function」。
// 新模块本身没有旧版本，就不存在这个窗口。（assumeDeleteRole 是 lib/oss.js 里
// 早就有的导出，引用它是安全的。）
//
// 长期 AK 一条 OSS 权限都没有，只会 AssumeRole，所以这里必须先借一次角色，
// 拿一份只允许删这几个 key 的临时凭证。
export async function deleteObjects(keys) {
  const list = (keys ?? []).filter(Boolean);
  if (!list.length) return { deleted: 0 };

  const credentials = await assumeDeleteRole(list);

  const client = new OSS({
    region: OSS_REGION,
    bucket: OSS_BUCKET,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken,
    secure: true
  });

  await client.deleteMulti(list, { quiet: true });
  return { deleted: list.length };
}
