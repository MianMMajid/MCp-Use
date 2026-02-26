import { server } from "../state.js";
import { registerOpsGovernanceRoutes } from "./ops-governance-routes.js";

registerOpsGovernanceRoutes(server.app);
