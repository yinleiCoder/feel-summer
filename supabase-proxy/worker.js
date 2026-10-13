// Supabase 反向代理：把自定义域名上的请求原样转给 Supabase 项目。
//
// 为什么需要它（实测，不是推测）：
//   在国内部分线路上，凡是 TLS ClientHello 里 SNI 带 supabase.co 的连接，
//   握手会被直接重置。同一台机器、同一个 IP，换个 SNI 就 200 ——
//   被针对的是域名，不是 IP、不是 Cloudflare。
//
//   本次复现记录（2026-10-13）：
//     curl https://igsgrfbyplzjrjwfauwj.supabase.co/auth/v1/health  -> 000（连接被重置）
//     curl https://registry.npmjs.org/                              -> 200（同样是 Cloudflare IP）
//     curl https://api.myquiz.cn/auth/v1/health                     -> 401（自定义域名，通）
//     curl https://workers.dev                                      -> 000（*.workers.dev 同样被封）
//
//   最后一条很关键：不能图省事直接绑 *.workers.dev，那个域名同样不通，
//   必须走自己的域名。
//
// 所以这里做的只有一件事：把主机名换掉。路径、查询串、请求头、请求体全部原样。
//
// 刻意不做的事：
//   · 不做缓存 —— auth 的响应一旦被缓存会串号（把一个用户的会话发给下一个人）；
//   · 不做鉴权 —— apikey / Authorization 原样透传，鉴权是 Supabase 的事；
//   · 不挑路径 —— 不做 /auth/v1、/rest/v1 白名单，省不下任何东西；
//   · 不接 OSS —— 图片和视频走阿里云直连，绕这一趟只会更慢，还会把免费额度拖爆。
//
// 与 myquiz 那个代理的唯一区别就是 UPSTREAM 这一行。

/** Supabase 项目域名（不含协议）。换项目时只改这一行。 */
const UPSTREAM = 'igsgrfbyplzjrjwfauwj.supabase.co';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = UPSTREAM;
    url.port = '';

    // new Request(url, request) 会把 method / headers / body 整个照搬。
    // 不要手工复制 body：Request 的 body 是流，读过一次就没了。
    // 直接把上游的 Response 返回，不要用 new Response(res.body, ...) 重建 ——
    // Cloudflare 在 fetch 时已经解过压，重建却会把 content-encoding: gzip
    // 带回去而 body 是明文。
    return fetch(new Request(url, request));
  }
};
