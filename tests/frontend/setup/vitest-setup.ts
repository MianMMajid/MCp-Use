import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, beforeEach, expect, vi } from "vitest";

expect.extend(matchers);

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      const normalized = String(key);
      return store.has(normalized) ? store.get(normalized) ?? null : null;
    },
    key(index: number) {
      const keys = Array.from(store.keys());
      return Number.isInteger(index) && index >= 0 && index < keys.length ? keys[index] : null;
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  };
}

beforeEach(() => {
  const memoryLocalStorage = createMemoryStorage();
  const memorySessionStorage = createMemoryStorage();
  vi.stubGlobal("localStorage", memoryLocalStorage);
  vi.stubGlobal("sessionStorage", memorySessionStorage);
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryLocalStorage,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: memorySessionStorage,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  if (typeof sessionStorage?.clear === "function") {
    sessionStorage.clear();
  }
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
  Reflect.deleteProperty(window, "MapleAuth");
  Reflect.deleteProperty(window, "MapleHttp");
  Reflect.deleteProperty(window, "mapleDesktop");
  Reflect.deleteProperty(window, "google");
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
