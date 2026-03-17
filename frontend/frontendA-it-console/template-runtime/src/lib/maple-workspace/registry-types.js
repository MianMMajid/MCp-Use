/**
 * @typedef {'observe' | 'chat' | 'admin' | 'firewalls' | 'users' | 'compliance' | 'docs'} MapleWorkspaceCategory
 */

/**
 * @typedef {{ title: string, id: string, tag?: string }} MapleWorkspaceAnchor
 */

/**
 * @typedef {{ label: string, href: string }} MapleWorkspaceDocLink
 */

/**
 * @typedef {'live' | 'chat' | 'timeline' | 'control' | 'topology' | 'forks' | 'guard' | 'fork' | 'settings' | 'policy' | 'marketplace' | 'cybersecurity' | 'rules' | 'context-leakage' | 'action-forks' | 'access' | 'overview' | 'api' | 'runbooks' | 'route-help'} MapleWorkspaceView
 */

/**
 * @typedef {Object} MapleWorkspaceRouteRecord
 * @property {string} path
 * @property {string} title
 * @property {MapleWorkspaceCategory} category
 * @property {string} tabLabel
 * @property {string} description
 * @property {MapleWorkspaceAnchor[]} anchors
 * @property {string[]} apiEndpoints
 * @property {MapleWorkspaceDocLink[]} legacyDocLinks
 * @property {MapleWorkspaceView} preferredView
 * @property {string[]} legacyAliases
 * @property {MapleWorkspaceView[]} docsViews
 */

export const MAPLE_WORKSPACE_CATEGORY_IDS = Object.freeze([
  'chat',
  'observe',
  'admin',
  'firewalls',
  'users',
  'compliance',
  'docs',
])

/**
 * @param {unknown} value
 * @returns {value is MapleWorkspaceCategory}
 */
export function isMapleWorkspaceCategory(value) {
  return (
    typeof value === 'string' &&
    MAPLE_WORKSPACE_CATEGORY_IDS.includes(/** @type {MapleWorkspaceCategory} */ (value))
  )
}

/**
 * @param {unknown} value
 * @returns {MapleWorkspaceCategory}
 */
export function normalizeMapleWorkspaceCategory(value) {
  return isMapleWorkspaceCategory(value) ? value : 'observe'
}
