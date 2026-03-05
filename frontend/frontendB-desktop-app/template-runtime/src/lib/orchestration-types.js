/**
 * @typedef {Object} OrchestrationObjectivePackage
 * @property {string} goal
 * @property {string} successCriteria
 * @property {number} runtimeLimitMinutes
 * @property {number} budgetUsd
 * @property {'low'|'medium'|'high'|'critical'} riskCeiling
 * @property {string} contextUrls
 * @property {string} outputContract
 * @property {string} escalationPolicy
 */

/**
 * @typedef {Object} OrchestrationConversationMessage
 * @property {string} id
 * @property {'user'|'manager'|'system'} role
 * @property {string} text
 * @property {string} createdAt
 */

/**
 * @typedef {Object} OrchestrationLoopState
 * @property {'plan'|'delegate'|'observe'|'re-plan'|'complete'|'halted'} phase
 * @property {number} iteration
 * @property {number} maxIterations
 */

/**
 * @typedef {Object} OrchestrationTask
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {string} ownerRole
 * @property {string=} ownerAgentId
 */

/**
 * @typedef {Object} TimedReassignmentCommand
 * @property {string} dueAt
 * @property {number=} repeatIntervalMinutes
 * @property {number=} maxRepeats
 * @property {string=} targetRole
 * @property {string=} targetAgentId
 * @property {string=} reason
 */

/**
 * @typedef {Object} TemplateRoleBinding
 * @property {string} roleId
 * @property {string} displayName
 * @property {string=} agentId
 */

/**
 * @typedef {Object} OrchestrationTemplateDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {TemplateRoleBinding[]} roles
 */

export const OBJECTIVE_RISK_CEILINGS = ['low', 'medium', 'high', 'critical']

export function createDefaultObjectivePackage(overrides = {}) {
  return {
    goal: '',
    successCriteria: '',
    runtimeLimitMinutes: 60,
    budgetUsd: 100,
    riskCeiling: 'medium',
    contextUrls: '',
    outputContract: '',
    escalationPolicy: '',
    ...overrides,
  }
}

export function normalizeObjectivePackage(input = {}) {
  return createDefaultObjectivePackage({
    goal: String(input.goal || ''),
    successCriteria: String(input.successCriteria || ''),
    runtimeLimitMinutes: Number(input.runtimeLimitMinutes || 0),
    budgetUsd: Number(input.budgetUsd || 0),
    riskCeiling: OBJECTIVE_RISK_CEILINGS.includes(input.riskCeiling) ? input.riskCeiling : 'medium',
    contextUrls: Array.isArray(input.contextUrls)
      ? input.contextUrls.join('\n')
      : String(input.contextUrls || ''),
    outputContract: String(input.outputContract || ''),
    escalationPolicy: String(input.escalationPolicy || ''),
  })
}

export function contextUrlsToArray(contextUrlsText) {
  return String(contextUrlsText || '')
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function validateObjectivePackage(input = {}, options = {}) {
  const pkg = normalizeObjectivePackage(input)
  const { requireComplete = true } = options
  const errors = {}

  const requiredTextFields = [
    ['goal', 'Goal is required.'],
    ['successCriteria', 'Success criteria is required.'],
    ['contextUrls', 'Context docs/URLs are required.'],
    ['outputContract', 'Output contract is required.'],
    ['escalationPolicy', 'Escalation policy is required.'],
  ]

  for (const [field, message] of requiredTextFields) {
    if (requireComplete && !String(pkg[field] || '').trim()) {
      errors[field] = message
    }
  }

  if (!Number.isFinite(pkg.runtimeLimitMinutes) || pkg.runtimeLimitMinutes <= 0) {
    errors.runtimeLimitMinutes = 'Runtime limit must be greater than 0 minutes.'
  }

  if (!Number.isFinite(pkg.budgetUsd) || pkg.budgetUsd < 0) {
    errors.budgetUsd = 'Budget must be 0 or greater.'
  }

  if (!OBJECTIVE_RISK_CEILINGS.includes(pkg.riskCeiling)) {
    errors.riskCeiling = 'Risk ceiling is invalid.'
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: pkg,
  }
}
