import OSS from 'ali-oss';

import { OSS_BUCKET, OSS_REGION } from '@/lib/oss-config';

// 浏览器侧的上传。只在 'use client' 组件里用。
//
// 凭证来自服务端签发，有效期一小时。两个端点、两种授权级别：
//   /api/oss/sts     相册，要求 admin，可写 {uid}/*
//   /api/oss/avatar  头像，只要登录，可写 {uid}/avatar/*
// 各自缓存，不能混用 —— 普通用户拿不到相册那份，也没必要拿到。

const REFRESH_MARGIN_MS = 60 * 1000;

/** endpoint -> { client, expiresAt } */
const cache = new Map();

async function fetchCredentials(endpoint) {
  const res = await fetch(endpoint, { method: 'POST' });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `获取上传凭证失败（HTTP ${res.status}）`);
  }
  return data;
}

async function getClient(endpoint) {
  const hit = cache.get(endpoint);
  if (hit && hit.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return hit.client;
  }

  const { credentials, region, bucket } = await fetchCredentials(endpoint);

  const client = new OSS({
    // 用 region + bucket 让 SDK 自己拼 endpoint。
    // 不能把公开读取用的 origin 传进来 —— 那个地址带了 bucket 子域，会重复拼接。
    region: region || OSS_REGION,
    bucket: bucket || OSS_BUCKET,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken,
    secure: true,
    // 临时凭证有效期 1 小时，而一个 2GB 的视频在慢速上行下可能传得更久。
    // 每 20 分钟主动续一次，别等过期了才在某个分片上撞 403。
    refreshSTSTokenInterval: 20 * 60 * 1000,
    // 上传中途凭证过期时，SDK 会回调这里换新的，而不是让整个文件失败。
    refreshSTSToken: async () => {
      const fresh = await fetchCredentials(endpoint);
      return {
        accessKeyId: fresh.credentials.accessKeyId,
        accessKeySecret: fresh.credentials.accessKeySecret,
        stsToken: fresh.credentials.securityToken
      };
    }
  });

  const expiresAt = credentials.expiration
    ? new Date(credentials.expiration).getTime()
    : Date.now() + 3000_000;

  cache.set(endpoint, { client, expiresAt });
  return client;
}

// 对象键是 uuid，内容永不改变，所以可以放心长缓存。
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=31536000, immutable' };

// 分片大小按文件大小反推，而不是写死。
//
// OSS 的硬限制是「单分片 100KB–5GB」和「一次上传最多 10000 片」。固定 1MB 时
// 一个 2GB 视频要 2048 片 —— 请求数太多、进度条一格一格地跳，中途失败的概率
// 也跟着涨。按目标片数反推能让大小文件都走在一个合理的数量级上：
//   2GB -> 8MB/片 -> 256 片
//   1MB -> 1MB/片 -> 1 片
const MIN_PART_SIZE = 1024 * 1024; // 1 MB
const MAX_PART_SIZE = 64 * 1024 * 1024; // 64 MB
const TARGET_PARTS = 256;

const partSizeFor = (size) =>
  Math.min(MAX_PART_SIZE, Math.max(MIN_PART_SIZE, Math.ceil(size / TARGET_PARTS)));

/**
 * 上传相册本体（照片 / 视频原文件）。
 * 用分片上传，这样大视频有真实进度，断网重试也只重传失败的分片。
 */
export async function uploadObject({ file, objectKey, onProgress }) {
  const client = await getClient('/api/oss/sts');

  return client.multipartUpload(objectKey, file, {
    partSize: partSizeFor(file.size),
    // 3 路并发：8MB/片时约 24MB 在途，家用上行也吃得消；
    // 再高只会让每个分片都变慢，并不会让总时间更短。
    parallel: 3,
    headers: CACHE_HEADERS,
    progress: (p) => onProgress?.(p)
  });
}

/** 上传小文件（视频封面）。走简单 PUT，不必为几十 KB 走三次分片请求。 */
export async function uploadSmall({ file, objectKey }) {
  const client = await getClient('/api/oss/sts');
  return client.put(objectKey, file, { headers: CACHE_HEADERS });
}

/** 上传头像。裁剪后只有几十 KB，同样走简单 PUT。 */
export async function uploadAvatar({ file, objectKey }) {
  const client = await getClient('/api/oss/avatar');
  return client.put(objectKey, file, { headers: CACHE_HEADERS });
}
