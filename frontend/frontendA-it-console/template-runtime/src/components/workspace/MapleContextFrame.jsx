'use client'

export function MapleContextFrame({ children }) {
  return (
    <main className="mw-context-frame" data-testid="maple-workspace-shell">
      <div className="mw-context-scroll">{children}</div>
    </main>
  )
}
