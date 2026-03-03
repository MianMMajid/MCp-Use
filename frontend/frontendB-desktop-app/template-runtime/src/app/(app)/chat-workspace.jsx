'use client'

import { useChat } from '@/contexts/chat-context'
import { ChatPanel } from '@/components/agent-workspace/chat-panel'
import { ChatHeader } from '@/components/chat-header'
import { CpuChipIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

function EmptyState() {
  const { selectedAgentId } = useChat()

  if (!selectedAgentId) {
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
    selectedAgentId,
    selectedAgent,
    messages,
    streaming,
    sessionId,
    runError,
    handleSend,
    handleStopped,
    handleRetry,
  } = useChat()

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const isDisabled = selectedAgent ? selectedAgent.status !== 'active' : !selectedAgentId

  return (
    <div className="flex h-full flex-col">
      <ChatHeader onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)} />

      {!selectedAgentId ? (
        <EmptyState />
      ) : (
        <div className="flex-1 overflow-hidden">
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
        </div>
      )}
    </div>
  )
}
