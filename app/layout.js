import { Geist, Geist_Mono } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";

import SmoothScroll from "@/components/SmoothScroll";
import { ThemeStoreProvider } from "@/lib/store/theme-store-provider";
import { THEME_SCRIPT } from "@/lib/store/theme-store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "知夏",
    template: "%s · 知夏",
  },
  description: "知夏 —— 尹磊的个人主页",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning is on <html> for one reason: THEME_SCRIPT below
    // rewrites this element's class, data-theme and color-scheme before React
    // hydrates, so the DOM legitimately differs from the server's markup. It only
    // silences the warning for this element's own attributes.
    //
    // The server always renders the light shell (the default theme). Reading the
    // stored preference here would mean cookies() in the root layout, which under
    // cacheComponents turns every statically-rendered route dynamic; the pre-paint
    // script gets the same result without that cost.
    //
    // 注意这里的三处（class 里的 dark、data-theme、color-scheme）必须和
    // theme-store.js 里的 defaultInitState 保持一致，否则首帧会用一套壳、
    // ThemeToggle 又按另一套判断。改默认主题时三处一起改。
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-background antialiased`}
      data-theme="light"
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* First child of <body>, so it is parsed and run before anything below it
            can paint. React renders a non-async <script> where it stands rather
            than hoisting it, which is what makes this ordering hold. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ThemeStoreProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </ThemeStoreProvider>
      </body>
    </html>
  );
}
