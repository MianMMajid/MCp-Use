import { writable } from 'svelte/store';

const SIDEBAR_WIDTH_KEY = 'mayple_sidebar_width';
const SIDEBAR_COLLAPSED_KEY = 'mayple_sidebar_collapsed';
const THEME_KEY = 'mayple_theme';
const MIN_WIDTH = 248;
const MAX_WIDTH = 420;

function clampWidth(width) {
  const value = Number(width) || 304;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value));
}

function createShellStore() {
  const initial = {
    sidebarWidth: 304,
    sidebarCollapsed: false,
    searchOpen: false,
    theme: 'light',
  };

  const { subscribe, update, set } = writable(initial);

  function hydrate() {
    if (typeof window === 'undefined') return;
    const storedWidth = clampWidth(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    const collapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    const storedTheme = window.localStorage.getItem(THEME_KEY) || 'light';
    const theme = storedTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    set({ ...initial, sidebarWidth: storedWidth, sidebarCollapsed: collapsed, theme });
  }

  function setSidebarWidth(width) {
    update((state) => {
      const next = { ...state, sidebarWidth: clampWidth(width) };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next.sidebarWidth));
      }
      return next;
    });
  }

  function setSidebarCollapsed(sidebarCollapsed) {
    update((state) => {
      const next = { ...state, sidebarCollapsed: Boolean(sidebarCollapsed) };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next.sidebarCollapsed));
      }
      return next;
    });
  }

  function toggleSidebar() {
    update((state) => {
      const next = { ...state, sidebarCollapsed: !state.sidebarCollapsed };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next.sidebarCollapsed));
      }
      return next;
    });
  }

  function setSearchOpen(searchOpen) {
    update((state) => ({ ...state, searchOpen: Boolean(searchOpen) }));
  }

  function toggleTheme() {
    update((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_KEY, next);
        document.documentElement.setAttribute('data-theme', next);
      }
      return { ...state, theme: next };
    });
  }

  return {
    subscribe,
    hydrate,
    setSidebarWidth,
    setSidebarCollapsed,
    toggleSidebar,
    setSearchOpen,
    toggleTheme
  };
}

export const shellStore = createShellStore();
