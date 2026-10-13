import fs from 'node:fs';
import path from 'node:path';

import { Agent, setGlobalDispatcher } from 'undici';

// Node 的 fetch 就是 undici，而它的连接超时走的是**独立于 AbortSignal 的一套**：
// 给 fetch 传 signal 再长也没用，connectTimeout 到点它自己先放弃，报出来是
// UND_ERR_CONNECT_TIMEOUT。默认值是 10s。
//
// 这台机器到 Cloudflare 会周期性地进「慢档」：同一个 /auth/v1/health 实测过
// 240ms（连测 8 次都很快），也实测过 9.8s，还有连续三次直接 10s 超时。
// 链路本身是通的，只是连接阶段偶尔要等十几秒 —— 而 10s 的天花板会把「慢」
// 直接变成「失败」，失败信息又是 TypeError: fetch failed，看起来像应用崩了。
//
// 所以抬高连接超时，让慢只是慢。写成显式的 devDependency，而不是蹭 shadcn
// 带进来的那份：那种依赖关系哪天变了，这里会以一种很难查的方式失效。
setGlobalDispatcher(
  new Agent({ connectTimeout: 20_000, headersTimeout: 30_000, bodyTimeout: 30_000 })
);

// 测试专用的一块板子。
//
// 看板是全局共享的：测试如果直接往 'main' 上拖，会把站长真实栏里的顺序重排掉。
// 而且「拖进空栏」这条用例在真实板上根本没法测 —— 你没法保证「已完成」栏当时是空的。
// 所以测试用 ?board=e2e 拿一块自己的、每次开跑前清空的板子。
//
// 所有写入都带 board=eq.e2e，**任何 DELETE 都不许不带这个条件**。

export const E2E_BOARD = 'e2e';

const ROOT = process.cwd();

export function env() {
  const out = {};
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!m) continue;
    out[m[1]] = (m[2] ?? '').split(/\s+#/)[0].trim();
  }
  return out;
}

// 用 secret key 直连 PostgREST：绕过 RLS，所以能建出「不是当前用户创建」的种子数据，
// 也能保证清库是彻底的。这一对函数只服务于测试，绝不出现在应用代码里。
function adminHeaders(envVars) {
  return {
    apikey: envVars.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${envVars.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };
}

// 链路抖动（见文件开头）之外还有偶发的硬失败，这里再补一层重试。
//
// 这些请求是测试基建自己发的（播种、清库、查库），不是被测对象。它们因为网络抖动
// 挂掉只会把一次正常的运行染红，所以这里重试；被测应用自己发的请求不在此列，
// 那些失败仍然照原样暴露 —— 「写库失败时回滚」那条用例全靠这个前提才有意义。
export async function apiFetch(url, init = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw new Error(
    `请求 ${url} 连续 ${attempts} 次失败：${lastError?.cause?.code ?? lastError?.message}`
  );
}

export async function clearBoard() {
  const envVars = env();
  const res = await apiFetch(
    `${envVars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tasks?board=eq.${E2E_BOARD}`,
    { method: 'DELETE', headers: adminHeaders(envVars) }
  );
  if (!res.ok) throw new Error(`清空 e2e 板失败：${res.status} ${await res.text()}`);
}

// 播种借用的那个 profile id，取一次就够。
//
// 每次 seedBoard 都去查一遍是白跑一趟网络 —— 每个用例至少播种一次，一轮下来就是
// 十几次多余往返，而每次往返都是一次撞上链路抖动「慢档」的机会。id 在整轮运行里
// 不会变，缓存住。
let cachedOwnerId = null;

async function ownerId(envVars) {
  if (cachedOwnerId) return cachedOwnerId;

  const res = await apiFetch(
    `${envVars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`,
    { headers: adminHeaders(envVars) }
  );
  const [profile] = await res.json();
  if (!profile) throw new Error('库里一个 profiles 都没有，无法播种');

  cachedOwnerId = profile.id;
  return cachedOwnerId;
}

/** @param rows [{ status, position, title, description? }] */
export async function seedBoard(rows) {
  const envVars = env();

  // created_by 非空且外键指向 profiles，所以借站长的 id —— 找一个已有 profile 就行。
  const owner = await ownerId(envVars);

  const body = rows.map((row, i) => ({
    board: E2E_BOARD,
    status: row.status,
    position: row.position ?? i,
    title: row.title,
    description: row.description ?? '',
    created_by: owner
  }));

  const res = await apiFetch(`${envVars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tasks`, {
    method: 'POST',
    headers: { ...adminHeaders(envVars), Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`播种 e2e 板失败：${res.status} ${await res.text()}`);
  return res.json();
}

/** 直接查库，用来断言「落库的顺序」而不是「界面上的顺序」。 */
export async function readBoardFromDb() {
  const envVars = env();
  const res = await apiFetch(
    `${envVars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tasks?board=eq.${E2E_BOARD}&select=title,status,position&order=status,position`,
    { headers: adminHeaders(envVars) }
  );
  if (!res.ok) throw new Error(`读 e2e 板失败：${res.status} ${await res.text()}`);
  return res.json();
}

/** 页面上某一栏里的卡片标题，按 DOM 顺序。 */
export const columnTitles = (page, status) =>
  page.$$eval(`[data-testid="column-${status}"] [data-testid="task-card"]`, (els) =>
    els.map((e) => e.querySelector('p')?.textContent?.trim() ?? '')
  );

/** 把一张卡拖到某个坐标。分段移动，否则 dnd-kit 收不到足够的 move 事件。 */
export async function dragCardTo(page, card, target) {
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  return async () => page.mouse.up();
}
