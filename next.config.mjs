/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // ali-oss 的 Node 入口会拉进 urllib，而 urllib 在 detect_proxy_agent.js 里
  // 有一个 `require('proxy-agent')` —— 那是给配了 HTTP 代理时才走的懒加载分支，
  // 但打包器会静态解析它，于是构建直接失败（proxy-agent 并不是它的安装依赖）。
  // 把 ali-oss 标成外部包，让服务端在运行时按 Node 的方式 require，
  // 既不是把它打进 server bundle，也不会碰到那个永远不执行的分支。
  //
  // 浏览器侧不受影响：ali-oss 的 package.json 里有 browser 字段，
  // 会换成预编译的 dist/aliyun-oss-sdk.js，不含 urllib。
  serverExternalPackages: ['ali-oss'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
