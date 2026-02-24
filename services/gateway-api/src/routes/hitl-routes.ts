import { server } from "../state.js";
import { registerHitlListApprovalsRoute } from "./hitl-routes-list.js";
import { registerHitlWatchApprovalsRoute } from "./hitl-routes-watch.js";
import { registerHitlDecisionRoute } from "./hitl-routes-decision.js";

registerHitlListApprovalsRoute(server.app);
registerHitlWatchApprovalsRoute(server.app);
registerHitlDecisionRoute(server.app);
