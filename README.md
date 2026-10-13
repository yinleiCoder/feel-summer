# 知夏 · feel-summer

个人网站：影像相册（图/视频 + 评论）、日程日历、族谱编辑器、看板、以及一套管理员体系。

线上数据存在 Supabase（Postgres + Auth），**文件和视频存在阿里云 OSS**。前端是 Next.js 16 App Router。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16.4（App Router、Turbopack）、React 19.3 |
| 样式 | Tailwind v4（无配置文件，入口 `app/globals.css`）+ shadcn/ui（`radix-ui` 统一包） |
| 后端 | Supabase（Postgres + Auth + RLS），无自建服务端 |
| 存储 | 阿里云 OSS，浏览器直传（STS 临时凭证） |
| 状态 | Zustand（**只用于主题**）、其余靠 React 本地状态 + 手动 refetch |
| 动效 | GSAP + ScrollTrigger、three.js（Lanyard）、ogl（FlexCarousel）、motion、Lenis |
| 功能库 | @dnd-kit（看板）、@fullcalendar/react v7（日程）、@xyflow/react（族谱）、lightgallery（相册灯箱）、vidstack（视频）、react-easy-crop（头像）、fuse.js（相册搜索） |
| 测试 | Playwright（`channel: 'chrome'`，跑真实系统 Chrome） |

> 本项目是纯 JS：`components/ui/` 下是 `.jsx` 而非 `.tsx`，路径别名只有 `jsconfig.json` 里的 `@/* -> ./*`。

---

## 目录结构

```
proxy.js                 ← 中间件，见下文「Next 16 的三个坑」（在仓库根，不在 app/ 下）
next.config.mjs          cacheComponents / reactCompiler / ali-oss 外部化
app/
  layout.js              根布局：主题脚本 + Lenis 平滑滚动
  globals.css            Tailwind v4 入口 + 主题 token
  (auth)/                登录 / 注册（刻意在 (site) 之外，不带固定导航）
  (site)/                首页、相册、照片详情、日程、资料、上传、看板、族谱、管理
  api/                   oss/sts、oss/avatar、profile/avatar、media/[id]
  auth/callback/         Supabase 邮箱确认 / OAuth 回调
components/
  ui/                    shadcn 基础组件
  album/ auth/ admin/ family/ kanban/ profile/ schedule/   各功能模块
  *.jsx                  全局动效原语（GSAP / ogl / three / Lenis）
hooks/use-viewer.js      客户端当前用户（claims + profile）
lib/
  supabase/              server / client / admin / proxy 四个客户端
  roles.js               角色与权限判定
  kanban.js appointments.js media.js        纯函数数据层
  family/                model / graph / lineage / operations / reducer / layout / data
  oss*.js upload.js crop-image.js           存储与上传
e2e/                     Playwright（global-setup + fixtures + kanban.spec）
supabase-proxy/          Cloudflare Worker 反代源码
```

---

## 架构要点

### 1. Supabase 走自建反代

国内线路直连 `*.supabase.co` 会被 **SNI 阻断**，`*.workers.dev` 同样不通。所以 `supabase-proxy/worker.js` 用 Cloudflare Worker 把请求原样转发到真实项目域，并绑定**自定义域名** `api.yinleilei.cn` —— 这就是 `NEXT_PUBLIC_SUPABASE_URL` 的值。

Worker 刻意不做缓存（auth 响应绝不能被共享）、不做鉴权、不过滤路径，**也不代理 OSS**（延迟 + 免费额度）。

> 换域名会让所有人登出一次 —— Supabase 的 cookie 名由 host 派生。

### 2. 认证与角色

- 客户端分四种：`lib/supabase/server.js`（RSC / Route Handler）、`client.js`（浏览器，**按 tab 记忆化** —— refresh token 是一次性的，两个实例并发刷新会互相吊销）、`admin.js`（secret key，仅 `/admin` 的角色读写）、`proxy.js`（会话刷新）。
- 服务端一律用 **`getClaims()`**：它有 JWKS 验签、顺带完成刷新。不用 `getUser()`（每次导航都多一次网络往返），也不用 `getSession()`（不验签）。
- 角色存在 `auth.users.app_metadata.role`，即 JWT 里，共三档：`user` / `admin` / `super_admin`（`lib/roles.js`）。UI 判定和 RLS 读的是同一个 claim，所以不会打架。
- **角色改了要等 token 刷新才生效** —— 因此有 `components/admin/RefreshSessionButton.jsx`，`use-viewer.js` 也会在 `TOKEN_REFRESHED` / `USER_UPDATED` 时 `router.refresh()`。
- 降级最后一个 `super_admin` 会被服务端拒绝。首个超管只能手动在 Supabase 后台设置。
- 注册开放，无审批队列；新用户默认 `user`，由超管在 `/admin` 提权。

**路由保护不在中间件里**，而在每个页面自己：`await connection()` → `createClient()` → `getClaims()` → 不通过就 `redirect('/login?next=…')`。页面上的角色判断是 **UX 门禁，真正的强制在 RLS**。

### 3. Next 16 的三个坑（本仓库已按新写法落地）

| 变更 | 影响 |
| --- | --- |
| `middleware.js` → **`proxy.js`**，导出 `middleware` → `proxy` | 残留旧文件不会报错，只是**永远不会被调用** —— 表现为用户静默掉线 |
| `cookies()` / `params` / `searchParams` 变成 Promise | 必须 `await` |
| `cacheComponents: true` | 见下 |

`cacheComponents` 是本项目影响面最大的配置。`getClaims()` 内部会调 `Date.now()` 判断 `exp`，而预渲染期间任何不稳定取值都会让整条路由变成阻塞路由。所以：

- 每个读会话的页面都必须在 `getClaims()` 之前 `await connection()`（显式的「永不预渲染」标记），配合 `<Suspense>`；
- 内部大量调用 `Date.now()` 的第三方库（lightgallery、FullCalendar）一律 `dynamic(..., { ssr: false })` 并单独成模块。

### 4. 文件存储：OSS + STS，不用 Supabase Storage

换掉 Supabase Storage 后，原本由 `storage.objects` 的 RLS 提供的授权没了，改为**短时凭证**承担，收口在 `app/api/oss/sts/route.js`：

- 长期 AccessKey **没有任何 OSS 权限，只能 AssumeRole** —— 即使环境变量泄漏，拿到的也只是「借帽子的钥匙」；
- 会话策略把范围收窄：上传 → `{uid}/*`，头像 → `{uid}/avatar/*`，删除 → 指定 key 的 DeleteObject；
- `uid` 一律取自验签后的 claims，**绝不取自请求体**，否则任何用户都能给自己签发别人目录的写权限。

浏览器侧 `lib/oss-client.js` 直传：大文件自适应分片（目标 ~256 片，1 MB–64 MB，并发 3），每 20 分钟刷新 STS 并挂 `refreshSTSToken`（2 GB 视频活过 1 小时的 token）。对象 key 是 `{uid}/{id}.{ext}`，**原始文件名不进 OSS**，绕开转义 / key 报错 / Unicode 归一化的一堆问题。

删文件一律走服务端（浏览器凭证没有 DeleteObject 权限），且**先写库再删文件** —— 反过来会留下打不开的头像。

### 5. 数据层

无 Realtime、无订阅，需要「近实时」的地方靠乐观更新 + 手动 refetch。

| 表 | 用途 |
| --- | --- |
| `profiles` / `profile_private` | 公开资料 / 手机与地址（仅本人 + 管理员） |
| `media` | 相册条目；`media_freeze_identity` 保护 `storage_path` 与 `uploaded_by` |
| `comments` | 评论，插入时强制 `user_id = auth.uid()` |
| `tasks` | 看板；四条策略都要求 admin+，排序走 RPC `move_task` |
| `appointments` | 日程，仅本人可见 |
| `family_trees` | 族谱，`graph` 为 jsonb，用 `revision` 做乐观并发 |

数据语义集中在 `lib/` 的纯函数里，服务端与客户端共用同一份，避免两边逻辑漂移。几个刻意的设计：

- **相册分页用 keyset 而非 OFFSET**：多文件上传共享同一个 `now()`，并发插入下 OFFSET 会错位；
- **看板的 `applyMove` / `resolveDropTarget` 与 `move_task` 的下标语义严格对齐**（`p_index` 是「移除被拖卡片之后的插入位置」）；
- **族谱编辑器**是一套完整的状态机：手写世系布局（dagre 画不出同层夫妻连线）、`revision` 冲突检测、30 步历史、所有增删改查为带校验的纯函数（关系校验放在操作层 —— 入口有工具栏/属性面板/画布三处，光禁用按钮不够）。

### 6. 测试

Playwright 单 spec（`e2e/kanban.spec.js`），约 14 条用例覆盖拖拽、跨栏、空栏、键盘操作、Esc 取消（断言**零写入**）、落库顺序、RPC 失败回滚、匿名拒绝。

两个隔离措施：

- 测试只操作 **`?board=e2e`** 这块专属板子，绝不碰真实的 `main` 板；
- `global-setup.js` 自建一个管理员账号 `kanban-e2e@example.com`（不用真人账号），走**真实登录表单**拿 storageState，供所有用例复用；每轮把角色压回 `admin`。

`playwright.config.js` **不配 `webServer`**：这个项目的开发服务器本来就一直在跑，而 `next dev` 拒绝起第二个实例。端口用 `PLAYWRIGHT_BASE_URL` 覆盖（默认 3000）。

`e2e/fixtures/board.js` 里还有两处针对性处理：把 undici 的 `connectTimeout` 抬到 20 s（Node fetch 的连接超时**独立于 AbortSignal**，默认 10 s 会把「慢」变成 `fetch failed`），以及测试基建请求自动重试 —— 但被测应用自己发的请求不重试，否则「写库失败时回滚」那条用例就失去意义了。

---

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入真实值
npm run dev                  # http://localhost:3000
```

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 反代域名（`https://api.yinleilei.cn`），不是 `*.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公开，可进客户端 bundle |
| `SUPABASE_SECRET_KEY` | **仅服务端**，绕过 RLS，只给 `auth.admin.*` 用 |
| `NEXT_PUBLIC_OSS_REGION` / `_BUCKET` / `_ENDPOINT` | 非密钥，但出现在每个图片 URL 里，浏览器必须拿得到 |
| `OSS_ACCESS_KEY_ID` / `_SECRET` / `OSS_STS_ROLE_ARN` | **仅服务端**，且该 key 只能 AssumeRole |
| `UNSPLASH_ACCESS_KEY` | **仅服务端**，登录/注册页背景墙；留空则用内置固定图 |

> 密钥一旦进了聊天记录、截图或提交历史，请立刻去控制台轮换。

### 测试

```bash
npm test                     # 需要另开一个终端先跑 npm run dev
PLAYWRIGHT_BASE_URL=http://localhost:3001 npm test
```

### 其它命令

```bash
npm run build && npm run start
```

---

## 部署

### Supabase 反代

```bash
npx wrangler deploy supabase-proxy/worker.js \
  --name feel-summer-proxy --compatibility-date 2026-09-01
```

详细动机、实测数据与部署步骤见 `supabase-proxy/README.md`。

### 应用

仓库里目前**没有** `vercel.json` / `vercel.ts`，也没有 `.vercel` 链接信息 —— 应用的部署目标尚未在代码中固化，按标准 Next.js 应用部署即可（`npm run build` → `npm run start`）。

需要注意 `cacheComponents` / `partialPrefetching` / `reactCompiler` 均已开启，构建与渲染行为跟旧版本差别很大：预渲染的约束、以及「哪些路由会被判成阻塞路由」都和默认配置不同。

`proxy.js` 的运行时固定为 Node.js，**不能**通过 `export const runtime` 改（会直接抛错）。

---

## 约定

- **页面不写可见标题，也不写 `h1`** —— 导航就是标签，标题交给 `metadata.title`。
- 注释解释 **why 而不是 what**，中英文混排；踩过的坑（Turbopack 陈旧模块导出、ali-oss 打包、CJK 进内联 style 触发 ByteString、族谱数据丢失事故）都写在对应位置的注释里，改动前先读。
- `AGENTS.md` 由 `next dev` 自动生成，会警告你去读 `node_modules/next/dist/docs/` —— 这个 Next 版本的破坏性变更多于训练数据，动手前先查。
