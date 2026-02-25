import { asObject } from "./helpers-casting.js";
export async function readJsonBody(c) {
    try {
        return asObject(await c.req.json());
    }
    catch {
        return {};
    }
}
export async function withAbortTimeout(timeoutMs, run) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await run(controller.signal);
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=helpers-async.js.map