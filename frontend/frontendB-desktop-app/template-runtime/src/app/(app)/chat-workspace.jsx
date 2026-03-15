'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@/contexts/chat-context'
import { ChatPanel } from '@/components/agent-workspace/chat-panel'
import { OrchestrationChatPanel } from '@/components/orchestration/orchestration-chat-panel'
import { Bars3Icon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import { CpuChipIcon } from '@heroicons/react/24/outline'

const MODEL_STORAGE_KEY = 'mayple_dummy_model'
const MODEL_OPTIONS = [
  {
    id: 'auto',
    title: 'Auto',
    subtitle: 'Decides how long to think',
    trigger: 'Auto',
  },
  {
    id: 'instant-53',
    title: 'Instant 5.3',
    subtitle: 'Answers right away',
    trigger: 'Instant',
  },
  {
    id: 'thinking-52',
    title: 'Thinking 5.2',
    subtitle: 'Thinks longer for better answers',
    trigger: 'Thinking',
  },
  {
    id: 'pro-52',
    title: 'Pro 5.2',
    subtitle: 'Research-grade intelligence',
    trigger: 'Pro',
  },
]

function ModelSelectorPill() {
  const [model, setModel] = useState(MODEL_OPTIONS[2].id)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const selected = MODEL_OPTIONS.find((option) => option.id === model) || MODEL_OPTIONS[2]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored && MODEL_OPTIONS.some((option) => option.id === stored)) setModel(stored)
  }, [])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function onSelect(nextModel) {
    setModel(nextModel)
    setOpen(false)
    if (typeof window !== 'undefined') window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel)
  }

  return (
    <div ref={wrapperRef} className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-2xl border border-zinc-700/70 bg-zinc-900/95 px-3 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur transition hover:bg-zinc-900"
      >
        <span className="font-medium">Mayple 5.2</span>
        <span className="text-zinc-400">{selected.trigger}</span>
        <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
      </button>

      {open ? (
        <div className="absolute top-full left-0 z-50 mt-2 w-80 overflow-hidden rounded-3xl border border-zinc-600/40 bg-zinc-800/95 p-3 shadow-2xl backdrop-blur">
          <p className="px-2 pb-2 text-sm font-medium text-zinc-400">Latest</p>

          <div className="space-y-1">
            {MODEL_OPTIONS.map((option) => {
              const active = option.id === selected.id
              return (
                <button
                  key={option.id}
                  onClick={() => onSelect(option.id)}
                  className="flex w-full items-center justify-between rounded-2xl px-2 py-2 text-left transition hover:bg-zinc-700/60"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{option.title}</p>
                    <p className="mt-0.5 text-[13px] text-zinc-400">{option.subtitle}</p>
                  </div>
                  {active ? <CheckIcon className="h-5 w-5 text-zinc-100" /> : null}
                </button>
              )
            })}
          </div>

          <div className="my-2 border-t border-zinc-600/70" />
          <button className="flex w-full items-center justify-between rounded-2xl px-2 py-2 text-left transition hover:bg-zinc-700/60">
            <span className="text-sm font-medium text-zinc-200">Legacy models</span>
            <ChevronRightIcon className="h-4 w-4 text-zinc-400" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function EmptyState() {
  const { mode, selectedAgentId } = useChat()

  if (mode === 'agent' && !selectedAgentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <CpuChipIcon className="h-12 w-12 text-zinc-300 dark:text-zinc-600" />
        <h2 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
          How can I help you today?
        </h2>
        <p className="mt-2 max-w-sm text-center text-sm text-zinc-500 dark:text-zinc-400">
          Select an agent from the sidebar to start a conversation.
        </p>
      </div>
    )
  }

  return null
}

export default function ChatWorkspace() {
  const {
    mode,
    selectedAgentId,
    selectedAgent,
    messages,
    streaming,
    sessionId,
    runError,
    handleSend,
    handleStopped,
    handleRetry,
    selectedOrchestration,
    orchestrationConversation,
    orchestrationBusyAction,
    orchestrationRuntimeError,
    sendOrchestrationMessage,
  } = useChat()

  const isDisabled = selectedAgent ? selectedAgent.status !== 'active' : !selectedAgentId

  return (
    <div className="relative flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      <div className="pointer-events-none absolute top-3 left-3 z-20 hidden lg:block">
        <ModelSelectorPill />
      </div>
      <button
        onClick={() => {
          if (typeof window === 'undefined') return
          window.dispatchEvent(new CustomEvent('mayple:toggle-mobile-sidebar'))
        }}
        className="absolute top-3 left-3 z-20 rounded-xl border border-gray-200 bg-white p-2 text-zinc-500 shadow-sm transition hover:bg-gray-100 lg:hidden dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900"
        aria-label="Open sidebar"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'orchestration' ? (
          <OrchestrationChatPanel
            selectedOrchestration={selectedOrchestration}
            messages={orchestrationConversation}
            busyAction={orchestrationBusyAction}
            runtimeError={orchestrationRuntimeError}
            onSendMessage={sendOrchestrationMessage}
          />
        ) : !selectedAgentId ? (
          <EmptyState />
        ) : (
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            streaming={streaming}
            sessionId={sessionId}
            onStopped={handleStopped}
            error={runError}
            onRetry={handleRetry}
            disabled={isDisabled}
          />
        )}
      </div>
    </div>
  )
}
