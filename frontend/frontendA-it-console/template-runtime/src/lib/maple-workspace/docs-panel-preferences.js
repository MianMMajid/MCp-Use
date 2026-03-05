export const MAPLE_DOCS_PANEL_STORAGE_KEY = 'maple_workspace_docs_panel_v2'

export function parseStoredDocsPanelPreference(value) {
  if (value === 'open') {
    return true
  }
  if (value === 'closed') {
    return false
  }
  return undefined
}

export function resolveInitialDocsPanelState({ storedPreference, isDesktop }) {
  if (typeof storedPreference === 'boolean') {
    return storedPreference
  }
  return Boolean(isDesktop)
}
