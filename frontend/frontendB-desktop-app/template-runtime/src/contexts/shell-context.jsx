'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ShellContext = createContext(null)
const SIDEBAR_WIDTH_KEY = 'mayple_sidebar_width'
const SIDEBAR_COLLAPSED_KEY = 'mayple_sidebar_collapsed'
const MIN_SIDEBAR_WIDTH = 248
const MAX_SIDEBAR_WIDTH = 420

function readWidth() {
  if (typeof window === 'undefined') return 304
  const raw = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY) || 304)
  if (!Number.isFinite(raw)) return 304
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, raw))
}

function readCollapsed() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
}

export function ShellProvider({ children }) {
  const [sidebarWidth, setSidebarWidth] = useState(304)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [storageHydrated, setStorageHydrated] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])
  const clampSidebarWidth = useCallback(
    (width) => Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Number(width) || 304)),
    [],
  )
  const updateSidebarWidth = useCallback((width) => setSidebarWidth(clampSidebarWidth(width)), [clampSidebarWidth])
  const toggleSearch = useCallback(() => setSearchOpen((v) => !v), [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSidebarWidth(readWidth())
    setSidebarCollapsed(readCollapsed())
    setStorageHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth, storageHydrated])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed, storageHydrated])

  return (
    <ShellContext.Provider
      value={{
        sidebarWidth,
        setSidebarWidth: updateSidebarWidth,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        searchOpen,
        setSearchOpen,
        toggleSearch,
        notificationCount,
        setNotificationCount,
      }}
    >
      {children}
    </ShellContext.Provider>
  )
}

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within ShellProvider')
  return ctx
}
