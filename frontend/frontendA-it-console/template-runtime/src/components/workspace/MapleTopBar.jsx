'use client'

export function MapleTopBar({ activeRoute, activeCategoryLabel, activeViewLabel, docsOpen, onToggleDocs }) {
  return (
    <header className="mw-topbar">
      <div className="mw-topbar-brand">
        <span className="mw-brand-orb" aria-hidden />
        <div>
          <p className="mw-brand-label">Mayple Workspace</p>
          <p className="mw-brand-route">{activeRoute?.title ?? 'Operations Monitor'}</p>
        </div>
      </div>

      <div className="mw-topbar-status" aria-live="polite">
        <span className="mw-status-dot" aria-hidden />
        <span>
          {activeCategoryLabel} / {activeViewLabel}
        </span>
      </div>

      <div className="mw-topbar-actions">
        <span className="mw-source-badge">Source: Frontend B orchestration runtime</span>
        <button
          type="button"
          className="mw-docs-toggle"
          onClick={onToggleDocs}
          data-testid="maple-docs-toggle"
          aria-pressed={docsOpen}
          aria-controls="maple-docs-panel"
        >
          {docsOpen ? 'Hide docs' : 'Open docs'}
        </button>
      </div>
    </header>
  )
}
