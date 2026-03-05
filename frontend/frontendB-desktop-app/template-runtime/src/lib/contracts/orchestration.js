/** @typedef {'plan'|'delegate'|'observe'|'complete'|'halted'} OrchestrationPhase */
/** @typedef {{phase: OrchestrationPhase, iteration: number}} OrchestrationLoopState */
/** @typedef {{id: string, role: string, text: string, createdAt: string}} OrchestrationConversationMessage */
/** @typedef {{goal: string, successCriteria: string, runtimeLimitMinutes: number, budgetUsd: number, riskCeiling: string, contextUrls: string[]|string, outputContract: string, escalationPolicy: string}} OrchestrationObjectivePackage */
/** @typedef {{id: string, title: string, ownerAgentId?: string, ownerRole?: string, status: string}} OrchestrationTask */
/** @typedef {{id: string, taskId: string, dueAt: string, targetRole?: string, targetAgentId?: string, status: string}} TimedReassignmentCommand */
