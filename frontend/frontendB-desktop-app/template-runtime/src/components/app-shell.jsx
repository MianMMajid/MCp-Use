'use client'

import { useState, useEffect } from 'react'
import { CloseButton, Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { NavbarItem } from './navbar'
import { ChatSidebar } from './chat-sidebar'
import { CommandPalette } from './command-palette'
import { ShellProvider, useShell } from '@/contexts/shell-context'
import { useChat } from '@/contexts/chat-context'
import { Bars3Icon } from '@heroicons/react/20/solid'

function CloseMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

function MobileSidebar({ open, close }) {
  return (
    <Dialog open={open} onClose={close} className="lg:hidden">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <DialogPanel
        transition
        className="fixed inset-y-0 w-full max-w-80 border-r border-gray-100 bg-gray-50 transition duration-300 ease-in-out data-closed:-translate-x-full dark:border-gray-900 dark:bg-gray-950"
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="-mb-3 px-3 pt-3">
            <CloseButton as={NavbarItem} aria-label="Close navigation">
              <CloseMenuIcon />
            </CloseButton>
          </div>
          <ChatSidebar />
        </div>
      </DialogPanel>
    </Dialog>
  )
}

function ShellInner({ children }) {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const { sidebarWidth, setSidebarWidth, sidebarCollapsed, setSidebarCollapsed, toggleSidebar } = useShell()
  const { handleNewSession } = useChat()

  function beginResize(event) {
    if (typeof window === 'undefined') return
    const startX = event.clientX
    const startWidth = sidebarWidth

    function onMouseMove(moveEvent) {
      const delta = moveEvent.clientX - startX
      setSidebarWidth(startWidth + delta)
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return
      // Cmd+N — new chat
      if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        handleNewSession()
      }
      // Cmd+B — toggle sidebar
      if (e.key === 'b' && !e.shiftKey) {
        e.preventDefault()
        toggleSidebar()
      }
      // Cmd+K — command palette
      if (e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleNewSession, toggleSidebar])

  useEffect(() => {
    const onToggleMobileSidebar = () => setShowMobileSidebar((prev) => !prev)
    window.addEventListener('mayple:toggle-mobile-sidebar', onToggleMobileSidebar)
    return () => window.removeEventListener('mayple:toggle-mobile-sidebar', onToggleMobileSidebar)
  }, [])

  return (
    <div className="flex h-svh overflow-hidden bg-[var(--mayple-bg)]">
      {/* Mobile sidebar */}
      <MobileSidebar open={showMobileSidebar} close={() => setShowMobileSidebar(false)} />

      {/* Desktop sidebar */}
      <div className="hidden h-full shrink-0 border-r border-gray-100/70 bg-gray-50/70 dark:border-gray-900/70 dark:bg-gray-950/70 lg:flex">
        {sidebarCollapsed ? (
          <div className="flex h-full w-14 items-start justify-center pt-3">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="rounded-xl p-2 text-zinc-500 transition hover:bg-gray-100 dark:hover:bg-gray-900"
              aria-label="Open sidebar"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="relative py-2" style={{ width: sidebarWidth + 10 }}>
            <div className="h-full" style={{ width: sidebarWidth }}>
              <ChatSidebar />
            </div>
            <div
              className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-gray-200/70 dark:hover:bg-gray-800/70"
              onMouseDown={beginResize}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>

      {/* Command palette */}
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

    </div>
  )
}

export function AppShell({ children }) {
  return (
    <ShellProvider>
      <ShellInner>{children}</ShellInner>
    </ShellProvider>
  )
}
