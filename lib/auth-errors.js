// Turns a Supabase auth error into something readable WITHOUT discarding the
// original. An earlier version replaced every unknown error with a generic
// "请稍后重试", which hid the one piece of information needed to diagnose a real
// failure — a network error looked identical to a rejected password.
//
// Rule: always keep the raw message. A friendly line is a prefix, never a
// replacement.

const NETWORK_PATTERNS = /failed to fetch|networkerror|load failed|fetch failed|err_/i;

export function describeAuthError(error, action = '操作') {
  if (!error) return null;

  const message = error.message || String(error);

  // AuthRetryableFetchError is what supabase-js returns when the request never
  // completed — DNS, TLS, an extension, or a missing/incorrect project URL. It
  // is NOT a credential problem, and saying "邮箱或密码不正确" here would send
  // the user chasing the wrong thing entirely.
  if (error.name === 'AuthRetryableFetchError' || NETWORK_PATTERNS.test(message)) {
    return `${action}失败：无法连接 Supabase（请求没有发出去）。请检查网络、浏览器插件，以及 .env.local 里的 NEXT_PUBLIC_SUPABASE_URL 是否正确。原始错误：${message}`;
  }

  if (/already registered|already exists|user already/i.test(message)) {
    return '该邮箱已经注册过了，直接登录即可。';
  }

  if (/invalid login credentials/i.test(message)) {
    // Deliberately vague about which half was wrong, to avoid letting anyone
    // enumerate registered emails.
    return '邮箱或密码不正确。';
  }

  if (/signups not allowed|signup disabled/i.test(message)) {
    return '该项目当前关闭了注册（Dashboard → Authentication → Sign In / Providers → Allow new users to sign up）。';
  }

  if (/email.*not confirmed/i.test(message)) {
    return '邮箱还没有确认。请到邮箱点开确认链接，或在 Dashboard 关闭 “Confirm email”。';
  }

  if (/password/i.test(message)) {
    return `密码不符合要求：${message}`;
  }

  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return `请求过于频繁，请稍后再试。原始错误：${message}`;
  }

  return `${action}失败：${message}`;
}
