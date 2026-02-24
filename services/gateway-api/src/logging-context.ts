import { AsyncLocalStorage } from "node:async_hooks";

export type MapleRequestContext = {
  requestId: string;
  method: string;
  path: string;
  tenantId?: string;
  deviceId?: string;
  sessionId?: string;
  traceId?: string;
};

export const requestContextStorage = new AsyncLocalStorage<MapleRequestContext>();

export function currentRequestContext(): MapleRequestContext | undefined {
  return requestContextStorage.getStore();
}
