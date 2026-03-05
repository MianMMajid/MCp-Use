import { describe, expect, it } from 'vitest'

import { FRONTEND_A_BUTTON_API_COVERAGE } from '../../../frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/button-api-coverage.js'

describe('frontend A button/api coverage manifest', () => {
  it('maps every business control to api + fake handler', () => {
    const businessControls = FRONTEND_A_BUTTON_API_COVERAGE.filter(
      (item) => item.actionType === 'business',
    )

    expect(businessControls.length).toBeGreaterThan(0)

    for (const control of businessControls) {
      expect(control.apiEndpoint, `${control.controlId} apiEndpoint`).toBeTruthy()
      expect(control.fakeHandler, `${control.controlId} fakeHandler`).toBeTruthy()
    }
  })

  it('uses the /api/ui namespace for business controls', () => {
    const nonUi = FRONTEND_A_BUTTON_API_COVERAGE.filter(
      (item) => item.actionType === 'business' && !item.apiEndpoint.includes('/api/ui/'),
    )

    expect(nonUi).toEqual([])
  })

  it('declares visual-only controls without api bindings', () => {
    const visualOnly = FRONTEND_A_BUTTON_API_COVERAGE.filter(
      (item) => item.actionType === 'visual-only',
    )

    expect(visualOnly.length).toBeGreaterThan(0)
    for (const control of visualOnly) {
      expect(control.apiEndpoint).toBe('')
      expect(control.fakeHandler).toBe('')
    }
  })
})
