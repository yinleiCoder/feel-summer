'use client';

import { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';

import { createThemeStore, defaultInitState, resolveInitialTheme } from './theme-store';

// One store per React tree, handed down through context, never exported as a
// module-level singleton — the pattern the Zustand App Router guide prescribes.
// It matters more than it looks: a module-level store on the server is one object
// shared by every request, so a value written while rendering one visitor's page
// is still there when the next visitor's page renders.
const ThemeStoreContext = createContext(undefined);

export function ThemeStoreProvider({ children, initState = defaultInitState }) {
  const storeRef = useRef(null);

  // Lazily created once per mount, not per render: `createThemeStore` returns a new
  // store every call, so running it on each render would hand consumers a fresh
  // store and drop every subscriber on every render.
  if (storeRef.current === null) {
    storeRef.current = createThemeStore({
      ...initState,
      theme: resolveInitialTheme(initState.theme)
    });
  }

  return <ThemeStoreContext.Provider value={storeRef.current}>{children}</ThemeStoreContext.Provider>;
}

// Selector first, like `useStore` itself: subscribing to the whole store re-renders
// on every unrelated change. The guard is the difference between "used outside the
// provider" being a clear error and being `undefined` somewhere deep in a callback.
export function useThemeStore(selector) {
  const store = useContext(ThemeStoreContext);
  if (!store) throw new Error('useThemeStore must be used within ThemeStoreProvider');
  return useStore(store, selector);
}
