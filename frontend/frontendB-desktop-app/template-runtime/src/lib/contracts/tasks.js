/**
 * @typedef {Object} TaskSchedule
 * @property {string} startAt
 * @property {string} timezone
 * @property {number} intervalMinutes
 * @property {number} maxRepeats
 * @property {string|null} [endAt]
 */

/**
 * @typedef {{ type: 'agent', agentId: string } | { type: 'orchestration', orchestrationId: string }} TaskAssignmentTarget
 */

/**
 * @typedef {Object} ScheduledTask
 * @property {string} id
 * @property {string} title
 * @property {string} prompt
 * @property {'running'|'paused'|'completed'|'failed'} status
 * @property {TaskSchedule} schedule
 * @property {TaskAssignmentTarget} assignment
 * @property {string|null} lastRunAt
 * @property {string|null} nextRunAt
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export {};
