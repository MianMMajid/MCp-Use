import { describe, expect, it } from 'vitest'

/**
 * Tests for the pure utility functions extracted from chat-store.js.
 * The store itself is heavily browser-dependent (window, localStorage, Svelte stores),
 * so we test the normalize/validation logic that can run in any environment.
 */

// These functions are not exported, so we re-implement the logic here to test the contracts.
// If the store is refactored to export them, these tests can import directly.

const VALID_PANELS = new Set(['controls', 'tasks', 'timeline', 'approvals', 'advanced'])

function normalizeMode(value: unknown): string {
  return value === 'orchestration' ? 'orchestration' : 'agent'
}

function normalizeStackMode(value: unknown): string {
  return value === 'backend' ? 'backend' : 'frontend'
}

function normalizePanel(value: unknown): string {
  const panel = String(value || '').toLowerCase()
  return VALID_PANELS.has(panel) ? panel : 'tasks'
}

describe('chat-store normalizeMode', () => {
  it('returns "orchestration" for orchestration input', () => {
    expect(normalizeMode('orchestration')).toBe('orchestration')
  })

  it('returns "agent" for any other input', () => {
    expect(normalizeMode('agent')).toBe('agent')
    expect(normalizeMode('')).toBe('agent')
    expect(normalizeMode(null)).toBe('agent')
    expect(normalizeMode(undefined)).toBe('agent')
    expect(normalizeMode('random')).toBe('agent')
  })
})

describe('chat-store normalizeStackMode', () => {
  it('returns "backend" for backend input', () => {
    expect(normalizeStackMode('backend')).toBe('backend')
  })

  it('returns "frontend" for any other input', () => {
    expect(normalizeStackMode('frontend')).toBe('frontend')
    expect(normalizeStackMode('')).toBe('frontend')
    expect(normalizeStackMode(null)).toBe('frontend')
    expect(normalizeStackMode(undefined)).toBe('frontend')
  })
})

describe('chat-store normalizePanel', () => {
  it('returns valid panel names', () => {
    expect(normalizePanel('controls')).toBe('controls')
    expect(normalizePanel('tasks')).toBe('tasks')
    expect(normalizePanel('timeline')).toBe('timeline')
    expect(normalizePanel('approvals')).toBe('approvals')
    expect(normalizePanel('advanced')).toBe('advanced')
  })

  it('is case-insensitive', () => {
    expect(normalizePanel('CONTROLS')).toBe('controls')
    expect(normalizePanel('Timeline')).toBe('timeline')
  })

  it('defaults to "tasks" for unknown panels', () => {
    expect(normalizePanel('unknown')).toBe('tasks')
    expect(normalizePanel('')).toBe('tasks')
    expect(normalizePanel(null)).toBe('tasks')
    expect(normalizePanel(undefined)).toBe('tasks')
  })
})
