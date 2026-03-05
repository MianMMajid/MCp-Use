'use client'

import { useChat } from '@/contexts/chat-context'
import { ChatPanel } from '@/components/agent-workspace/chat-panel'
import { ChatHeader } from '@/components/chat-header'
import { OrchestrationChatPanel } from '@/components/orchestration/orchestration-chat-panel'
import { WorkspaceRightPanel } from '@/components/workspace-right-panel'
import { CpuChipIcon } from '@heroicons/react/24/outline'

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
    <div className="flex h-full flex-col">
      <ChatHeader onToggleMobileSidebar={() => {}} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
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
        <WorkspaceRightPanel />
      </div>
    </div>
  )
}
