'use client'

import clsx from 'clsx'
import React from 'react'

function AnchorList({ routeRecord }) {
  if (!routeRecord?.anchors?.length) {
    return <p className="mw-docs-empty">No section anchors are defined for this route yet.</p>
  }

  return (
    <ul className="mw-docs-list" role="list">
      {routeRecord.anchors.map((anchor) => (
        <li key={anchor.id}>
          <a href={`${routeRecord.path}#${anchor.id}`}>{anchor.title}</a>
        </li>
      ))}
    </ul>
  )
}

function EndpointList({ routeRecord }) {
  if (!routeRecord?.apiEndpoints?.length) {
    return <p className="mw-docs-empty">No API endpoints registered for this route.</p>
  }

  return (
    <ul className="mw-docs-list" role="list">
      {routeRecord.apiEndpoints.map((endpoint) => (
        <li key={endpoint}>
          <code>{endpoint}</code>
        </li>
      ))}
    </ul>
  )
}

export function MapleDocsPanel({ isDesktop, isOpen, routeRecord, onClose }) {
  return (
    <>
      {!isDesktop && isOpen ? (
        <button
          type="button"
          className="mw-docs-backdrop"
          aria-label="Close documentation panel"
          onClick={onClose}
        />
      ) : null}
      <aside
        id="maple-docs-panel"
        className={clsx('mw-docs-panel', isOpen && 'mw-docs-panel-open')}
        aria-hidden={!isOpen}
        data-testid="maple-docs-panel"
      >
        <div className="mw-docs-header">
          <h2>Context Docs</h2>
          {!isDesktop ? (
            <button type="button" className="mw-docs-close" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        <section className="mw-docs-section" aria-labelledby="mw-docs-role-heading">
          <h3 id="mw-docs-role-heading">A/B Role Split</h3>
          <p>
            Frontend B handles orchestration authoring/execution. Frontend A monitors runtime and
            executes intervention controls.
          </p>
        </section>

        <section className="mw-docs-section" aria-labelledby="mw-docs-summary-heading">
          <h3 id="mw-docs-summary-heading">Route Summary</h3>
          <p>{routeRecord?.description ?? 'No route metadata loaded.'}</p>
        </section>

        <section className="mw-docs-section" aria-labelledby="mw-docs-anchors-heading">
          <h3 id="mw-docs-anchors-heading">Section Anchors</h3>
          <AnchorList routeRecord={routeRecord} />
        </section>

        <section className="mw-docs-section" aria-labelledby="mw-docs-endpoints-heading">
          <h3 id="mw-docs-endpoints-heading">API Endpoints</h3>
          <EndpointList routeRecord={routeRecord} />
        </section>

        <section className="mw-docs-section" aria-labelledby="mw-docs-legacy-heading">
          <h3 id="mw-docs-legacy-heading">Legacy Docs</h3>
          <ul className="mw-docs-list" role="list">
            {(routeRecord?.legacyDocLinks ?? []).map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  )
}
