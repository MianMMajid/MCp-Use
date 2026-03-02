'use client'

import { createContext, useCallback, useContext, useState } from 'react'

const ShellContext = createContext(null)

export function ShellProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorData, setInspectorData] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])
  const openInspector = useCallback((data) => {
    setInspectorData(data)
    setInspectorOpen(true)
  }, [])
  const closeInspector = useCallback(() => {
    setInspectorOpen(false)
    setInspectorData(null)
  }, [])
  const toggleSearch = useCallback(() => setSearchOpen((v) => !v), [])

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        inspectorOpen,
        inspectorData,
        openInspector,
        closeInspector,
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
