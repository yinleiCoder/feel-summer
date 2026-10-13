import { createStore } from 'zustand/vanilla';

// Framework-neutral theme store, following the Zustand App Router guide:
// a factory around `createStore` rather than a module-level `create()` singleton.
// A module-level store is shared by every request on the server, so anything that
// differs per user ends up in another user's response — see
// https://zustand.site/en/guides/nextjs-app-router/.
//
// Nothing here touches `document` at import time; the DOM is only read and written
// inside functions, which is what lets the root layout (a server component) import
// THEME_SCRIPT from this same module.

export const THEME_STORAGE_KEY = 'zhixia-theme';
export const THEME_DARK = 'dark';
export const THEME_LIGHT = 'light';

// Applied for the duration of a switch only, so the transition in globals.css
// cannot slow down every hover for the rest of the session.
export const THEME_TRANSITION_CLASS = 'theme-transition';
// Keep in step with the transition durations in globals.css.
const THEME_TRANSITION_MS = 520;
// Only ever touched in the browser (see applyTheme), so the shared server instance
// of this module never holds a timer.
let transitionTimer = 0;

export const defaultInitState = { theme: THEME_LIGHT };

const isTheme = value => value === THEME_DARK || value === THEME_LIGHT;

// The single writer for the theme. Three things have to agree or the page renders
// in one theme and behaves as if it were in the other:
//   - the `dark` class, which every `dark:` variant in the app keys off;
//   - `data-theme`, which ThemeToggle's sun/moon swap is styled from (and which the
//     anti-FOUC script reads back as the current theme);
//   - `color-scheme`, which paints scrollbars, form controls and the canvas the
//     browser shows behind the page.
//
// The transition class goes on in the same frame as the swap: a transition only
// runs when the property's value changes between two style recalcs and the new
// style declares it, so the class has to be there when the variables change.
// Toggling twice in a row cancels the previous timer, otherwise the class would be
// pulled out from under the second transition and cut it short.
const applyTheme = theme => {
  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);
  root.classList.toggle(THEME_DARK, theme === THEME_DARK);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  window.clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(
    () => root.classList.remove(THEME_TRANSITION_CLASS),
    THEME_TRANSITION_MS
  );
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode and blocked third-party storage both throw on write. The theme
    // still applies for this page view; only remembering it across reloads is lost.
  }
};

// The store is created during SSR too, where there is no document to read and the
// server default is the only answer. In the browser the anti-FOUC script has already
// resolved the stored preference onto the html element, so the store adopts what is
// on screen instead of re-deciding it — otherwise a visitor whose stored theme is
// light would hydrate with a store that claims dark, and their first click on the
// toggle would be a no-op.
export const resolveInitialTheme = fallback => {
  if (typeof document === 'undefined') return fallback;
  const applied = document.documentElement.dataset.theme;
  return isTheme(applied) ? applied : fallback;
};

export const createThemeStore = (initState = defaultInitState) =>
  createStore((set, get) => ({
    ...initState,
    setTheme: theme => {
      if (!isTheme(theme)) return;
      applyTheme(theme);
      set({ theme });
    },
    toggleTheme: () => {
      const next = get().theme === THEME_DARK ? THEME_LIGHT : THEME_DARK;
      applyTheme(next);
      set({ theme: next });
    }
  }));

// Inlined into the initial HTML and run before the first paint. Without it, a
// visitor who chose dark gets the server's light shell painted first and then
// flipped — one dark-to-light flash on every navigation.
//
// Written as a string because it has to be: it runs as a parser-blocking script,
// before React exists. The storage key and the default theme are interpolated so
// this and `applyTheme` cannot drift apart.
export const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme =
      stored === ${JSON.stringify(THEME_LIGHT)} || stored === ${JSON.stringify(THEME_DARK)}
        ? stored
        : ${JSON.stringify(THEME_LIGHT)};
    var root = document.documentElement;
    root.classList.toggle(${JSON.stringify(THEME_DARK)}, theme === ${JSON.stringify(THEME_DARK)});
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;
