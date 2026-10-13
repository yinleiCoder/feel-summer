import 'server-only';

import OSS from 'ali-oss';

import { OSS_BUCKET } from '@/lib/oss-config';

// 服务端的 OSS 凭证交换。
//
// 授权模型：长期 AccessKey 只存在服务端，永远不下发。浏览器要上传时，
// 服务端用 AK 调 STS AssumeRole，换一份**带 session policy 的临时凭证**，
// 策略把可写范围锁死在 {bucket}/{uid}/*。
//
// 这就是原来 storage.objects 上那几条 RLS 策略干的活 —— 现在授权不在数据库里，
// 而在签发出去的临时凭证里。所以调用方必须先自己验明身份：
// 见 app/api/oss/sts/route.js。

const REQUIRED = ['OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_STS_ROLE_ARN'];

/** 返回缺失的环境变量名，空数组表示配置完整。 */
export const missingServerOssEnv = () => REQUIRED.filter((name) => !process.env[name]);

/** 临时凭证有效期。够传完一个 250MB 的视频，又不会长到失去意义。 */
const SESSION_SECONDS = 3600;

function assertConfigured() {
  const missing = missingServerOssEnv();
  if (missing.length) {
    throw new Error(`缺少环境变量：${missing.join('、')}`);
  }
  if (!OSS_BUCKET) {
    throw new Error('缺少环境变量：NEXT_PUBLIC_OSS_BUCKET');
  }
}

/**
 * 借角色，拿一份带 session policy 的临时凭证。
 *
 * @param sessionName 会话名，阿里云侧可审计
 * @param statements  session policy 的 Statement 数组
 */
async function assumeRole(sessionName, statements) {
  assertConfigured();

  const sts = new OSS.STS({
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET
  });

  const policy = { Version: '1', Statement: statements };

  const result = await sts.assumeRole(
    process.env.OSS_STS_ROLE_ARN,
    policy,
    SESSION_SECONDS,
    sessionName
  );

  const c = result?.credentials;
  if (!c?.AccessKeyId || !c?.AccessKeySecret || !c?.SecurityToken) {
    throw new Error('STS 返回的凭证不完整');
  }

  return {
    accessKeyId: c.AccessKeyId,
    accessKeySecret: c.AccessKeySecret,
    securityToken: c.SecurityToken,
    expiration: c.Expiration
  };
}

/**
 * 上传用：只能写 uid 自己的目录。
 *
 * @param uid 必须来自服务端验证过的会话（claims.sub），绝不能是客户端传上来的值 ——
 *            否则任何登录用户都能给自己签发别人目录的写权限。
 */
export const assumeUploadRole = (uid) =>
  assumeRole(`upload-${uid}`, [
    {
      Effect: 'Allow',
      // oss:PutObject 在 OSS 里覆盖了 InitiateMultipartUpload / UploadPart /
      // CompleteMultipartUpload，不需要单独列出。
      Action: ['oss:PutObject', 'oss:AbortMultipartUpload', 'oss:ListParts'],
      Resource: [`acs:oss:*:*:${OSS_BUCKET}/${uid}/*`]
    }
  ]);

/**
 * 头像用：任何登录用户都能传自己的头像，但只能写 {uid}/avatar/ 这一层。
 *
 * 和上传相册的凭证是两个不同的授权级别 —— 相册要 admin，头像只要登录。
 * 拆开而不是复用一个「更宽松」的凭证，是因为凭证一旦签出去就收不回来：
 * 普通用户拿到的这张，就算被翻出来也只能往自己的头像目录写。
 */
export const assumeAvatarRole = (uid) =>
  assumeRole(`avatar-${uid}`, [
    {
      Effect: 'Allow',
      Action: ['oss:PutObject', 'oss:AbortMultipartUpload', 'oss:ListParts'],
      Resource: [`acs:oss:*:*:${OSS_BUCKET}/${uid}/avatar/*`]
    }
  ]);

/**
 * 删除用：只能删指定的那几个对象键。
 *
 * 为什么删除也要借角色，而不是直接用长期 AK ——
 * 长期 AK 身上**一条 OSS 权限都没有**，它只会 AssumeRole。这是刻意的：
 * 万一环境变量泄露，对方拿到的也只是一把「能去借帽子」的钥匙，而不是读写 bucket 的能力。
 * 删除是管理动作（任何管理员都能删任何一块砖），所以临时借一次、只授权这几个 key。
 *
 * 注意：session policy 只能收窄不能放大，所以角色的权限策略里也必须包含
 * oss:DeleteObject，否则这里签出来的凭证依然删不掉东西。
 */
export const assumeDeleteRole = (keys) =>
  assumeRole('delete', [
    {
      Effect: 'Allow',
      Action: ['oss:DeleteObject'],
      Resource: keys.map((key) => `acs:oss:*:*:${OSS_BUCKET}/${key}`)
    }
  ]);
