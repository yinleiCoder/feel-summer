import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import { apiFetch } from './fixtures/board.js';

// 所有测试共用的一个管理员账号 + 一份已登录的 storageState。
//
// 为什么需要它：/kanban 只对管理员开放，测试不登录根本进不去；而登录动作如果
// 每个 spec 各做一次，会反复触发 Supabase 的登录限流。做一次、存下来、复用。
//
// 账号是**建出来**的，不是复用真人的 —— 测试全程不许碰站长的真实账号。

export const TEST_EMAIL = 'kanban-e2e@example.com';
export const TEST_PASSWORD = 'KanbanE2e!2026';

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, 'e2e', '.auth', 'admin.json');

function loadEnv() {
  const out = {};
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!m) continue;
    out[m[1]] = (m[2] ?? '').split(/\s+#/)[0].trim();
  }
  return out;
}

// globalSetup 拿到的 FullConfig 里 use 还没解析出来（config.use 是 undefined），
// 所以这里和 playwright.config.js 用同一个环境变量、同一个默认值。
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default async function globalSetup() {
  const env = loadEnv();
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;

  if (!base || !secret) {
    throw new Error('globalSetup 需要 .env.local 里的 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SECRET_KEY');
  }

  const H = {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json'
  };

  // 同样走 apiFetch：这一层要是因为网络抖动挂掉，整套用例一条都不会跑，
  // 报出来的却只是「0 tests」，最容易被当成配置写错了。
  const listRes = await apiFetch(`${base}/auth/v1/admin/users?per_page=200`, { headers: H });
  const list = await listRes.json();
  let user = list.users?.find((u) => u.email === TEST_EMAIL);

  if (!user) {
    const created = await apiFetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true })
    });
    if (!created.ok) {
      throw new Error(`创建测试账号失败：${created.status} ${await created.text()}`);
    }
    user = await created.json();
  }

  // 每次都把角色压回 admin —— 上一条改过角色的测试会把它改掉，
  // 而一个不是管理员的测试账号会让整套用例全红，症状还很难往这里想。
  //
  // 读-改-写：app_metadata 里还有 GoTrue 自己的 provider / providers，
  // 直接覆盖会让这个账号下次登录时身份解析失败。
  await apiFetch(`${base}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      app_metadata: { ...(user.app_metadata ?? {}), role: 'admin' }
    })
  });

  // 走一遍真实的登录表单来拿 storageState。
  // 直接拼 cookie 不是不行，但那样测的就不是登录本身了 ——
  // 而登录正是这个页面能不能进去的前提。
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 120_000 });
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/album', { timeout: 30_000 }).catch(() => {});

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  await context.storageState({ path: STATE_PATH });
  await browser.close();
}
