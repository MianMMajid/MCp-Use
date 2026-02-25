import { server } from "../state.js";
import { demoRoutesEnabled } from "../config.js";
import { registerDemoSessionsRoute } from "./demo-session-sessions-route.js";
import { registerDemoStartRoute } from "./demo-session-start-route.js";
import { registerDemoSyncRoute } from "./demo-session-sync-route.js";
if (demoRoutesEnabled) {
    registerDemoSessionsRoute(server.app);
    registerDemoStartRoute(server.app);
    registerDemoSyncRoute(server.app);
}
//# sourceMappingURL=demo-session-routes.js.map