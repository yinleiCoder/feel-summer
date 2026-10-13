'use client';

import { Moon, Sun } from 'lucide-react';

import { useThemeStore } from '@/lib/store/theme-store-provider';

// The store is used for the click, not for the look.
//
// Both icons are always rendered and CSS decides which one is visible, keyed off the
// `dark` class the store writes to <html>. That is deliberate: the store resolves its
// starting value in the browser (from what the anti-FOUC script already painted), so
// on a machine whose stored theme is light the client and the server disagree at
// hydration time. Anything theme-dependent in this markup — swapping a single icon,
// or an aria-label naming the target theme — would be a hydration mismatch, and the
// icon swap would lag a paint behind the background it belongs to.
//
// A bare <button> rather than the UI Button: this one sits inside the nav, where the
// menu panel slides underneath it, and its colour has to come from the header (see
// the `[data-open]` rule in StaggeredMenu.css). The Button's variants set a colour of
// their own, which would win over the inherited one on hover and leave the icon
// white on a white panel.
export default function ThemeToggle() {
  const toggleTheme = useThemeStore(state => state.toggleTheme);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="切换亮暗主题"
      className="theme-toggle inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4"
    >
      {/* Shown while the page is dark: the sun is the theme you would switch to. */}
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="block dark:hidden" />
    </button>
  );
}
