'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@/contexts/chat-context'
import { ChatPanel } from '@/components/agent-workspace/chat-panel'
import { OrchestrationChatPanel } from '@/components/orchestration/orchestration-chat-panel'
import { Bars3Icon, CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { CpuChipIcon } from '@heroicons/react/24/outline'
import {
  CHAT_MODEL_OPTIONS,
  OPENAI_CHAT_MODEL_FAMILIES,
  getChatModelOption,
  readStoredChatModelSelection,
  writeStoredChatModelSelection,
} from '@/lib/config/openai-chat-models'

function ModelSelectorPill() {
  const [selection, setSelection] = useState(readStoredChatModelSelection())
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const selected = getChatModelOption(selection)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSelection(readStoredChatModelSelection(window.localStorage))
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

  function onSelect(option) {
    const nextSelection = { modelId: option.modelId, reasoningEffort: option.reasoningEffort }
    setSelection(nextSelection)
    setOpen(false)
    if (typeof window !== 'undefined') writeStoredChatModelSelection(window.localStorage, nextSelection)
  }

  return (
    <div ref={wrapperRef} className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-2xl border border-zinc-700/70 bg-zinc-900/95 px-3 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur transition hover:bg-zinc-900"
      >
        <span className="font-medium">{selected.modelTitle}</span>
        <span className="text-zinc-400">{selected.reasoningTitle}</span>
        <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
      </button>

      {open ? (
        <div className="absolute top-full left-0 z-50 mt-2 w-80 overflow-hidden rounded-3xl border border-zinc-600/40 bg-zinc-800/95 p-3 shadow-2xl backdrop-blur">
          {OPENAI_CHAT_MODEL_FAMILIES.map((family, familyIndex) => (
            <div key={family.modelId}>
              <p className="px-2 pb-2 text-sm font-medium text-zinc-400">{family.title}</p>
              <div className="space-y-1">
                {CHAT_MODEL_OPTIONS.filter((option) => option.modelId === family.modelId).map((option) => {
                  const active = option.id === selected.id
                  return (
                    <button
                      key={option.id}
                      onClick={() => onSelect(option)}
                      className="flex w-full items-center justify-between rounded-2xl px-2 py-2 text-left transition hover:bg-zinc-700/60"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{option.reasoningTitle}</p>
                        <p className="mt-0.5 text-[13px] text-zinc-400">{option.subtitle}</p>
                      </div>
                      {active ? <CheckIcon className="h-5 w-5 text-zinc-100" /> : null}
                    </button>
                  )
                })}
              </div>
              {familyIndex < OPENAI_CHAT_MODEL_FAMILIES.length - 1 ? (
                <div className="my-2 border-t border-zinc-600/70" />
              ) : null}
            </div>
          ))}
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
  const showModelSelector = mode !== 'orchestration' && !selectedAgentId

  return (
    <div className="relative flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      {showModelSelector ? (
        <div className="pointer-events-none absolute top-3 left-3 z-20 hidden lg:block">
          <ModelSelectorPill />
        </div>
      ) : null}
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
