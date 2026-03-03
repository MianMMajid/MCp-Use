'use client'

import { useState, useEffect } from 'react'
import { CloseButton, Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { NavbarItem } from './navbar'
import { ChatSidebar } from './chat-sidebar'
import { TracePanel } from './trace-panel'
import { ShellProvider, useShell } from '@/contexts/shell-context'
import { useChat } from '@/contexts/chat-context'

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
        className="fixed inset-0 bg-black/30 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <DialogPanel
        transition
        className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-closed:-translate-x-full"
      >
        <div className="flex h-full flex-col rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="-mb-3 px-4 pt-3">
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
  const { sidebarCollapsed, toggleSidebar } = useShell()
  const { handleNewSession, toggleTrace } = useChat()

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
      // Cmd+Shift+T — toggle trace panel
      if (e.key === 't' && e.shiftKey) {
        e.preventDefault()
        toggleTrace()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleNewSession, toggleSidebar, toggleTrace])

  return (
    <div className="flex h-svh overflow-hidden bg-white dark:bg-zinc-950">
      {/* Mobile sidebar */}
      <MobileSidebar open={showMobileSidebar} close={() => setShowMobileSidebar(false)} />

      {/* Desktop sidebar */}
      <div
        className={`hidden shrink-0 overflow-hidden border-r border-zinc-200 lg:block dark:border-zinc-800 transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-0' : 'w-[280px]'
        }`}
      >
        <div className="h-full w-[280px]">
          <ChatSidebar />
        </div>
      </div>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>

      {/* Trace panel */}
      <TracePanel />
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
