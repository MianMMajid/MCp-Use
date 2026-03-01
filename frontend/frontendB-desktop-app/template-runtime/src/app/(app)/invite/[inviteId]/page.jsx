'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Text } from '@/components/text'
import { postJson } from '@/lib/api'

export default function InviteAcceptPage() {
  const { inviteId } = useParams()
  const [status, setStatus] = useState('pending') // pending | accepting | accepted | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleAccept() {
    setStatus('accepting')
    setError('')
    try {
      const res = await postJson(`/api/org/invites/${inviteId}/accept`, {})
      if (res.ok) {
        const data = await res.json()
        setResult(data)
        setStatus('accepted')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to accept invitation.')
        setStatus('error')
      }
    } catch {
      setError('Failed to accept invitation. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Heading>Organization Invite</Heading>
      <Text className="mt-2">
        You have been invited to join an organization.
      </Text>

      <Divider className="my-6" />

      <div className="rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Subheading>Invitation Details</Subheading>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Invite ID: <span className="font-mono text-xs">{inviteId}</span>
        </p>

        {status === 'accepted' && result && (
          <div className="mt-4 space-y-2">
            {result.orgName && (
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                Organization: <span className="font-semibold">{result.orgName}</span>
              </p>
            )}
            {result.role && (
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                Role: <Badge color="blue">{result.role}</Badge>
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        {status === 'accepted' && (
          <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
            Invitation accepted successfully!
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {status === 'pending' && (
            <Button color="orange" onClick={handleAccept}>
              Accept Invitation
            </Button>
          )}
          {status === 'accepting' && (
            <Button color="orange" disabled>
              Accepting...
            </Button>
          )}
          {status === 'error' && (
            <Button color="orange" onClick={handleAccept}>
              Try Again
            </Button>
          )}
          {status === 'accepted' && (
            <Button href="/organization">
              Go to Organization
            </Button>
          )}
          <Button plain href="/">
            Back to Workspace
          </Button>
        </div>
      </div>
    </div>
  )
}
