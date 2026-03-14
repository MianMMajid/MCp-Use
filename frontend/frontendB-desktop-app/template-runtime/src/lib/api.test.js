import { afterEach, describe, expect, test, vi } from 'vitest';
import { getCached, invalidateCache, loadJson } from './api.js';

afterEach(() => {
  invalidateCache();
  vi.restoreAllMocks();
});

describe('api cache helpers', () => {
  test('loadJson caches results and invalidateCache clears them', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, value: 1 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadJson('/api/example');
    const second = await loadJson('/api/example');

    expect(first).toEqual({ ok: true, value: 1 });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCached('/api/example')).toEqual(first);

    invalidateCache('/api');
    expect(getCached('/api/example')).toBeNull();
  });
});
