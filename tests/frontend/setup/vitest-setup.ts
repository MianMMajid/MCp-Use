import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.clear();
  Reflect.deleteProperty(window, "MapleAuth");
  Reflect.deleteProperty(window, "MapleHttp");
  Reflect.deleteProperty(window, "mapleDesktop");
  Reflect.deleteProperty(window, "google");
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
