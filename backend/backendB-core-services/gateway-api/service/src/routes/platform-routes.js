import { server } from "../state.js";
import { registerPlatformProxyRoutes } from "./platform-proxy-routes.js";

registerPlatformProxyRoutes(server.app);
