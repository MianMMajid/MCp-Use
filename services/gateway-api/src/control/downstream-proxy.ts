export type {
  DownstreamAppConfig,
  DownstreamAppInfo,
  DownstreamToolInfo,
  DownstreamCallResult,
  DownstreamJsonRpcForwardResult,
} from "./downstream-proxy-types.js";

export {
  loadDownstreamAppsFromEnv,
  listDownstreamApps,
} from "./downstream-proxy-utils.js";

export {
  forwardJsonRpcToDownstream,
  listToolsFromDownstream,
  dispatchToolToDownstream,
} from "./downstream-proxy-client.js";
