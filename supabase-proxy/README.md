# supabase-proxy

一个极小的 Cloudflare Worker，把自定义域名上的请求原样转给 Supabase 项目，
用来绕开国内部分线路上针对 `*.supabase.co` 的 SNI 阻断。

## 部署

```bash
npx wrangler deploy worker.js --name feel-summer-proxy \
  --compatibility-date 2026-09-01
```

然后在 Cloudflare 控制台给 Worker 绑定自定义域名（**不要用 `*.workers.dev`，
那个域名同样被墙**）：

> Workers & Pages → feel-summer-proxy → Settings → Domains & Routes → Add → Custom Domain

绑定 `api.yinleilei.cn` 之类自己的域名即可，DNS 记录 Cloudflare 会自动加。

## 接到应用上

把 `.env.local` / 部署环境里的：

```
NEXT_PUBLIC_SUPABASE_URL=https://igsgrfbyplzjrjwfauwj.supabase.co
```

改成：

```
NEXT_PUBLIC_SUPABASE_URL=https://api.yinleilei.cn
```

不用改任何应用代码 —— `supabase-js` 的 auth / rest / storage / functions
四个地址都是从这一个 base URL 派生的（`SupabaseClient` 里
`new URL('auth/v1', baseUrl)` 那一组）。

## 两个副作用，遇到别慌

1. **所有人会被登出一次。** 会话 cookie 的名字是
   `sb-${hostname.split('.')[0]}-auth-token`，域名一换名字就变了。
2. **OSS 不要走这个代理。** 图片和视频直连阿里云，绕 Worker 只会更慢，
   而且相册每页几十个请求会很快吃掉 Workers 的免费额度（10 万请求/天）。
