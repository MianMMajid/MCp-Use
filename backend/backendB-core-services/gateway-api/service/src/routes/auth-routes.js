import { server } from "../state.js";
import { registerAuthMeRoute } from "./auth-routes-me.js";
import { registerAuthLoginRegisterRoutes } from "./auth-routes-login-register.js";
import { registerAuthGoogleRoutes } from "./auth-routes-google.js";
import { registerAuthLogoutRoute } from "./auth-routes-logout.js";
registerAuthMeRoute(server.app);
registerAuthLoginRegisterRoutes(server.app);
registerAuthGoogleRoutes(server.app);
registerAuthLogoutRoute(server.app);
//# sourceMappingURL=auth-routes.js.map