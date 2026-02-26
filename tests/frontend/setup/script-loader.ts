import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

let importCounter = 0;

export async function runBrowserScript(relativePath: string): Promise<void> {
  const absolutePath = resolve(process.cwd(), relativePath);

  if (typeof window === "undefined") {
    throw new Error("runBrowserScript requires a jsdom window context.");
  }

  importCounter += 1;
  const scriptUrl = `${pathToFileURL(absolutePath).href}?vtest=${importCounter}`;
  await import(scriptUrl);
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function flushPromises(ticks = 3): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}
