import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

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
