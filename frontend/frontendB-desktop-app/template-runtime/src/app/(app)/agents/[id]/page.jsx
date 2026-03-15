'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useChat } from '@/contexts/chat-context'

export default function AgentRedirectPage() {
  const { id: agentId } = useParams()
  const router = useRouter()
  const { selectAgent } = useChat()

  useEffect(() => {
    if (agentId) {
      selectAgent(agentId)
      router.replace('/')
    }
  }, [agentId, selectAgent, router])

  return (
    <div className="flex h-full items-center justify-center">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
    </div>
  )
}
