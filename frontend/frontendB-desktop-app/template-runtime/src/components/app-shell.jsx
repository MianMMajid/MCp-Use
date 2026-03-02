'use client'

import { useState } from 'react'
import { CloseButton, Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { NavbarItem } from './navbar'
import { TopBar } from './top-bar'
import { AppSidebar } from './app-sidebar'
import { InspectorPanel } from './inspector-panel'
import { ShellProvider, useShell } from '@/contexts/shell-context'

function OpenMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
    </svg>
  )
}

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
          <AppSidebar />
        </div>
      </DialogPanel>
    </Dialog>
  )
}

function ShellInner({ children }) {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const { sidebarCollapsed } = useShell()

  return (
    <div className="flex min-h-svh flex-col bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <TopBar />

      {/* Mobile menu button */}
      <div className="flex items-center px-4 py-2 lg:hidden">
        <NavbarItem onClick={() => setShowMobileSidebar(true)} aria-label="Open navigation">
          <OpenMenuIcon />
        </NavbarItem>
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar open={showMobileSidebar} close={() => setShowMobileSidebar(false)} />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className={`hidden shrink-0 overflow-y-auto lg:block ${sidebarCollapsed ? 'w-16' : 'w-64'} transition-[width] duration-200`}>
          <AppSidebar />
        </div>

        {/* Content area */}
        <main className="flex flex-1 flex-col overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
          <div className="flex-1 p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>

        {/* Inspector panel */}
        <InspectorPanel />
      </div>
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
