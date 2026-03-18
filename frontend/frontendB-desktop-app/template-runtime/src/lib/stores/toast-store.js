import { writable } from 'svelte/store';

const DISMISS_MS = 4000;
const MAX_TOASTS = 3;
const ANIMATION_MS = 250;
let idCounter = 0;

function createToastStore() {
  const { subscribe, update } = writable([]);
  const queue = [];

  function processQueue() {
    update((toasts) => {
      while (queue.length > 0 && toasts.length < MAX_TOASTS) {
        toasts = [queue.shift(), ...toasts];
      }
      return toasts;
    });
  }

  function add(message, type = 'info', options = {}) {
    const id = ++idCounter;
    const autoDismiss = type !== 'error'; // errors never auto-dismiss
    const duration = options.duration ?? DISMISS_MS;
    const action = options.action ?? null; // { label: 'Undo', onClick: () => {} }
    const toast = { id, message, type, dismissing: false, paused: false, action };

    let timerId = null;

    update((toasts) => {
      if (toasts.length >= MAX_TOASTS) {
        queue.push(toast);
        return toasts;
      }
      return [toast, ...toasts];
    });

    if (autoDismiss) {
      timerId = setTimeout(() => dismiss(id), duration);
    }

    // Store timer info for pause/resume
    toast._timerId = timerId;
    toast._remaining = autoDismiss ? duration : null;
    toast._startedAt = Date.now();

    return id;
  }

  function pause(id) {
    update((toasts) =>
      toasts.map((t) => {
        if (t.id === id && t._timerId && !t.paused) {
          clearTimeout(t._timerId);
          t._remaining = Math.max(0, (t._remaining ?? DISMISS_MS) - (Date.now() - (t._startedAt ?? Date.now())));
          t.paused = true;
        }
        return t;
      })
    );
  }

  function resume(id) {
    update((toasts) =>
      toasts.map((t) => {
        if (t.id === id && t.paused && t._remaining != null) {
          t._startedAt = Date.now();
          t._timerId = setTimeout(() => dismiss(id), t._remaining);
          t.paused = false;
        }
        return t;
      })
    );
  }

  function dismiss(id) {
    update((toasts) =>
      toasts.map((t) => {
        if (t.id === id) {
          clearTimeout(t._timerId);
          return { ...t, dismissing: true };
        }
        return t;
      })
    );
    setTimeout(() => {
      update((toasts) => toasts.filter((t) => t.id !== id));
      processQueue();
    }, ANIMATION_MS);
  }

  return {
    subscribe,
    success: (msg, opts) => add(msg, 'success', opts),
    error: (msg, opts) => add(msg, 'error', opts),
    info: (msg, opts) => add(msg, 'info', opts),
    warning: (msg, opts) => add(msg, 'warning', opts),
    show: (msg, type, opts) => add(msg, type, opts),
    dismiss,
    pause,
    resume,
  };
}

export const toastStore = createToastStore();
