import { server } from "../state.js";
import { registerGptOAuthRoutes } from "./gpt-adapter-oauth-routes.js";
import { registerGptPluginRoutes } from "./gpt-adapter-plugin-routes.js";
import { registerGptToolDispatchRoute } from "./gpt-adapter-tool-route.js";

registerGptOAuthRoutes(server.app);
registerGptPluginRoutes(server.app);
registerGptToolDispatchRoute(server.app);
