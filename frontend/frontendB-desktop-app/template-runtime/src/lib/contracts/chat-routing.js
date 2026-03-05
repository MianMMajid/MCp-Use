/**
 * @typedef {'agent'|'orchestration'} WorkspaceComposerMode
 */

/**
 * @typedef {'global'|'agent'|'orchestration'} ChatRouteTarget
 */

/**
 * @typedef {Object} ChatRoutingContext
 * @property {'agent'|'orchestration'} mode
 * @property {string=} selectedAgentId
 * @property {string=} selectedOrchestrationId
 * @property {string} modelId
 * @property {ChatRouteTarget} route
 */

export {}
