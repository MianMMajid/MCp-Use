import { writable } from 'svelte/store';

const DISMISS_MS = 4000;
const MAX_TOASTS = 5;
let idCounter = 0;

function createToastStore() {
  const { subscribe, update } = writable([]);

  function add(message, type = 'info') {
    const id = ++idCounter;
    const toast = { id, message, type, dismissing: false };

    update((toasts) => {
      const next = [toast, ...toasts];
      if (next.length > MAX_TOASTS) next.pop();
      return next;
    });

    setTimeout(() => dismiss(id), DISMISS_MS);
    return id;
  }

  function dismiss(id) {
    // Mark as dismissing for exit animation
    update((toasts) =>
      toasts.map((t) => (t.id === id ? { ...t, dismissing: true } : t))
    );
    // Remove after animation
    setTimeout(() => {
      update((toasts) => toasts.filter((t) => t.id !== id));
    }, 250);
  }

  return {
    subscribe,
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
    info: (msg) => add(msg, 'info'),
    warning: (msg) => add(msg, 'warning'),
    dismiss,
  };
}

export const toastStore = createToastStore();
