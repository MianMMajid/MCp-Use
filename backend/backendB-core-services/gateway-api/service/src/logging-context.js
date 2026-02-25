import { AsyncLocalStorage } from "node:async_hooks";
export const requestContextStorage = new AsyncLocalStorage();
export function currentRequestContext() {
    return requestContextStorage.getStore();
}
//# sourceMappingURL=logging-context.js.map