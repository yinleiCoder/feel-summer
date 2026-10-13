import { defineConfig } from '@playwright/test';

// 指向已经在跑的那个 dev server。
//
// 这里刻意**不配 webServer**：next dev 不允许同一目录起第二个实例，而这个项目
// 平时总有一个在跑（端口还不固定，见过 3000 / 3100 / 3002）。让 Playwright 自己
// 去起，只会在「Another next dev server is already running」上失败。
// 端口不一样时用 PLAYWRIGHT_BASE_URL 覆盖。
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',

  // 看板是共享的有状态资源：两个测试并行拖同一块板会互相踩。
  // 而且每次写入都是一趟真实网络请求。
  fullyParallel: false,
  workers: 1,

  // 打的是远端 Supabase（经 api.yinleilei.cn），别按本地内存库的超时去卡。
  //
  // 90s 而不是 60s：这条链路会周期性进「慢档」，而 page.goto 走的是应用自己的
  // 服务端请求，测试侧的重试救不了它 —— 只会在 goto 上超时。实测同一个健康检查
  // 接口快时 240ms，慢时 9.8s，一次 goto 要串起好几次这样的往返。
  // 放宽的是「等多久算挂」，不是「挂了也算过」：真失败仍然会失败。
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],

  // 建一次管理员测试账号 + 存一份已登录的 storageState，所有 spec 复用。
  globalSetup: './e2e/global-setup.js',

  use: {
    baseURL: BASE_URL,
    // 默认带着管理员的登录态跑。
    storageState: 'e2e/.auth/admin.json',

    // 用系统装的 Chrome，不用 Playwright 自带的那份：ms-playwright 下已有的
    // chromium 版本和这个包期望的对不上时，启动会直接报 executablePath 失败。
    // 系统 Chrome 一直可用，也省掉一次浏览器下载。
    channel: 'chrome',
    launchOptions: {
      // 无头下 WebGL 画布（Lanyard、FlexCarousel）需要这个才会真的渲染，
      // 否则截出来是空白 —— 沿用本项目既有的做法。
      args: ['--no-sandbox', '--enable-unsafe-swiftshader']
    },

    trace: 'retain-on-failure'
  }
});
