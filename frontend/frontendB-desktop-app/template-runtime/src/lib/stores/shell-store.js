import { writable } from 'svelte/store';

const THEME_KEY = 'mayple_theme';

function createShellStore() {
  const initial = {
    theme: 'light',
  };

  const { subscribe, update, set } = writable(initial);

  function hydrate() {
    if (typeof window === 'undefined') return;
    const storedTheme = window.localStorage.getItem(THEME_KEY) || 'light';
    const theme = storedTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    set({ ...initial, theme });
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
    toggleTheme
  };
}

export const shellStore = createShellStore();
