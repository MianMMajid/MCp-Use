/**
 * modifier-approval-watch.js
 *
 * SSE endpoint for real-time modifier approval notifications.
 * Reuses the pattern from hitl-routes-watch.js.
 */
import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { subscribeModifierApprovals } from "../modifier-approval-broker.js";
import { server } from "../state.js";

server.app.get("/api/openclaw/modifier/approvals/watch", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const encoder = new TextEncoder();
  let unsubscribe = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));

      unsubscribe = subscribeModifierApprovals((event) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`
          )
        );
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
