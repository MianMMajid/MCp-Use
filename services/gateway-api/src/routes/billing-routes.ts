import { server } from "../state.js";
import { registerBillingUserRoutes } from "./billing-user-routes.js";
import { registerBillingSubscriptionRoutes } from "./billing-subscription-routes.js";
import { registerBillingWebhookRoute } from "./billing-webhook-route.js";

registerBillingUserRoutes(server.app);
registerBillingSubscriptionRoutes(server.app);
registerBillingWebhookRoute(server.app);
