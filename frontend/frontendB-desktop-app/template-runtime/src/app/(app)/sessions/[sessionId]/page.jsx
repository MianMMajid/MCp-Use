'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@/components/description-list'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { loadJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonDetail } from '@/components/skeleton'

export default function SessionDetailPage() {
  const { sessionId } = useParams()
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [events, setEvents] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [artifacts, setArtifacts] = useState(null)
  const eventSourceRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const heartbeatTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const mountedRef = useRef(true)
  const MAX_RECONNECT = 5
  const HEARTBEAT_MS = 30000

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson(`/api/openclaw/agent/sessions/${sessionId}`)
        if (cancelled) return
        setSession(data)

        // If session has runs, fetch artifacts for first run
        const runs = Array.isArray(data?.runs) ? data.runs : []
        if (runs.length > 0) {
          const runId = runs[0].runId || runs[0].id
          if (runId) {
            try {
              const artifactData = await loadJson(`/api/openclaw/agent/runs/${runId}/artifacts`)
              if (!cancelled) setArtifacts(artifactData)
            } catch {
              // artifacts are optional
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('404')) {
            setNotFound(true)
          } else {
            setError(msg)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  function resetHeartbeat() {
    clearTimeout(heartbeatTimeoutRef.current)
    heartbeatTimeoutRef.current = setTimeout(() => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        reconnectStream()
      }
    }, HEARTBEAT_MS)
  }

  function reconnectStream() {
    if (!mountedRef.current) return
    if (reconnectAttemptsRef.current >= MAX_RECONNECT) {
      setStreaming(false)
      return
    }
    reconnectAttemptsRef.current++
    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) connectStream()
    }, 5000)
  }

  function connectStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    const es = new EventSource(`/api/openclaw/agent/sessions/${sessionId}/stream`)
    eventSourceRef.current = es

    es.onopen = () => {
      reconnectAttemptsRef.current = 0
      resetHeartbeat()
    }
    es.onmessage = (e) => {
      resetHeartbeat()
      try {
        const data = JSON.parse(e.data)
        setEvents((prev) => [...prev, data])
      } catch {
        setEvents((prev) => [...prev, { raw: e.data }])
      }
    }
    es.onerror = () => {
      es.close()
      reconnectStream()
    }
  }

  function startStream() {
    if (!mountedRef.current) return
    reconnectAttemptsRef.current = 0
    setStreaming(true)
    connectStream()
  }

  function stopStream() {
    clearTimeout(reconnectTimeoutRef.current)
    clearTimeout(heartbeatTimeoutRef.current)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStreaming(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimeoutRef.current)
      clearTimeout(heartbeatTimeoutRef.current)
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [])

  if (loading) return <SkeletonDetail />

  if (notFound) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/sessions" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Sessions
          </Link>
        </div>
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Session not found</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            The session &ldquo;{sessionId}&rdquo; does not exist or has expired.
          </p>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/sessions" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Sessions
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      </>
    )
  }

  const sessionStatus = session?.status || 'unknown'
  const runs = Array.isArray(session?.runs) ? session.runs : []
  const artifactList = Array.isArray(artifacts?.artifacts) ? artifacts.artifacts : Array.isArray(artifacts?.items) ? artifacts.items : []

  return (
    <>
      <div className="max-lg:hidden">
        <Link href="/sessions" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
          Sessions
        </Link>
      </div>
      <div className="mt-4 lg:mt-8">
        <div className="flex items-center gap-4">
          <Heading>
            {session?.name || session?.agentName || `Session ${typeof sessionId === 'string' ? sessionId.substring(0, 12) : sessionId}`}
          </Heading>
          <Badge color={statusColor(sessionStatus)}>{sessionStatus}</Badge>
        </div>
      </div>

      <div className="mt-12">
        <Subheading>Session Details</Subheading>
        <Divider className="mt-4" />
        <DescriptionList>
          <DescriptionTerm>Session ID</DescriptionTerm>
          <DescriptionDetails className="font-mono text-xs">{session?.sessionId || session?.id || sessionId}</DescriptionDetails>
          <DescriptionTerm>Agent</DescriptionTerm>
          <DescriptionDetails>{session?.agentName || session?.agent || '--'}</DescriptionDetails>
          <DescriptionTerm>Status</DescriptionTerm>
          <DescriptionDetails><Badge color={statusColor(sessionStatus)}>{sessionStatus}</Badge></DescriptionDetails>
          <DescriptionTerm>Started</DescriptionTerm>
          <DescriptionDetails>{formatDate(session?.startedAt || session?.createdAt)}</DescriptionDetails>
          <DescriptionTerm>Completed</DescriptionTerm>
          <DescriptionDetails>{formatDate(session?.completedAt || session?.endedAt)}</DescriptionDetails>
        </DescriptionList>
      </div>

      {/* Live Event Stream */}
      <div className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <Subheading>Live Event Stream</Subheading>
          {streaming ? (
            <Button color="red" onClick={stopStream}>Stop Stream</Button>
          ) : (
            <Button onClick={startStream}>Start Stream</Button>
          )}
        </div>
        <Divider className="mt-4" />
        {events.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            {streaming ? 'Waiting for events...' : 'Click "Start Stream" to watch live events.'}
          </p>
        )}
        {events.length > 0 && (
          <div className="mt-4 space-y-2">
            {events.map((event, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="mr-2 text-xs text-zinc-400 dark:text-zinc-500">#{idx + 1}</span>
                  {event.type || event.eventType || 'Event'}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {event.message || event.summary || event.raw || JSON.stringify(event).substring(0, 200)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Runs */}
      {runs.length > 0 && (
        <div className="mt-12">
          <Subheading>Runs</Subheading>
          <Divider className="mt-4" />
          <div className="mt-4 space-y-3">
            {runs.map((run, idx) => (
              <div key={run.runId || run.id || idx} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="mr-2 text-xs text-zinc-400 dark:text-zinc-500">#{idx + 1}</span>
                    {run.name || `Run ${run.runId || run.id || idx + 1}`}
                  </p>
                  <Badge color={statusColor(run.status)}>{run.status || 'unknown'}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {artifactList.length > 0 && (
        <div className="mt-12">
          <Subheading>Artifacts</Subheading>
          <Divider className="mt-4" />
          <div className="mt-4 space-y-3">
            {artifactList.map((artifact, idx) => (
              <div key={artifact.id || idx} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {artifact.name || artifact.filename || `Artifact ${idx + 1}`}
                </p>
                {artifact.type && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Type: {artifact.type}</p>
                )}
                {artifact.size && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Size: {artifact.size}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button href="/sessions">Back to Sessions</Button>
      </div>
    </>
  )
}
