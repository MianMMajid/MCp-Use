'use client'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'

// Shared set so sidebar can check which pages are already cached
export const _visitedPages = new Set()

/**
 * KeepAlive page cache — keeps visited page component trees mounted (hidden)
 * so revisits are truly instant (no re-mount, no re-fetch, no RSC round-trip).
 *
 * On pushState navigations (sidebar clicks to cached pages), children doesn't
 * change. We detect this via reference comparison and skip cache updates,
 * showing the previously-cached element instead.
 */
export function PageManager({ children }) {
  const pathname = usePathname()
  const cacheRef = useRef(new Map())
  const lastChildrenRef = useRef(null)

  _visitedPages.add(pathname)

  // Only update cache when children actually changed (real Next.js navigation)
  if (children !== lastChildrenRef.current) {
    cacheRef.current.set(pathname, children)
    lastChildrenRef.current = children
  }

  const hasCached = cacheRef.current.has(pathname)

  return (
    <>
      {Array.from(cacheRef.current.entries()).map(([path, content]) => (
        <div key={path} style={{ display: path === pathname ? 'contents' : 'none' }}>
          {content}
        </div>
      ))}
      {!hasCached && children}
    </>
  )
}
