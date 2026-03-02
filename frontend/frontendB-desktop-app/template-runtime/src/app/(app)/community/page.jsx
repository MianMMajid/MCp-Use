'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Textarea } from '@/components/textarea'
import { loadJson, postJson, invalidateCache } from '@/lib/api'
import { riskColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function CommunityPage() {
  const [stats, setStats] = useState(null)
  const [traces, setTraces] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Share dialog
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [sharePayload, setSharePayload] = useState('')
  const [shareLoading, setShareLoading] = useState(false)

  // Suggest dialog
  const [showSuggestDialog, setShowSuggestDialog] = useState(false)
  const [suggestPayload, setSuggestPayload] = useState('')
  const [suggestLoading, setSuggestLoading] = useState(false)

  // Brief state
  const [briefResult, setBriefResult] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)

  function fetchData() {
    setLoading(true)
    setError('')
    Promise.all([
      loadJson('/api/community/stats').catch(() => null),
      loadJson('/api/community/traces').catch(() => null),
    ]).then(([statsData, tracesData]) => {
      setStats(statsData)
      setTraces(Array.isArray(tracesData?.traces) ? tracesData.traces : Array.isArray(tracesData) ? tracesData : [])
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleShare() {
    setShareLoading(true)
    try {
      let body = {}
      if (sharePayload.trim()) {
        try { body = JSON.parse(sharePayload) } catch { body = { raw: sharePayload } }
      }
      const res = await postJson('/api/demo/share', body)
      if (res.ok) {
        invalidateCache('/api/demo')
        setMessage('Trace shared successfully.')
        setMessageType('success')
        setShowShareDialog(false)
        setSharePayload('')
        fetchData()
      } else {
        setMessage('Failed to share trace.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to share trace.')
      setMessageType('error')
    } finally {
      setShareLoading(false)
    }
  }

  async function handleSuggest() {
    setSuggestLoading(true)
    try {
      let body = {}
      if (suggestPayload.trim()) {
        try { body = JSON.parse(suggestPayload) } catch { body = { raw: suggestPayload } }
      }
      const res = await postJson('/api/demo/suggest', body)
      if (res.ok) {
        invalidateCache('/api/demo')
        setMessage('Suggestion submitted.')
        setMessageType('success')
        setShowSuggestDialog(false)
        setSuggestPayload('')
      } else {
        setMessage('Failed to submit suggestion.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to submit suggestion.')
      setMessageType('error')
    } finally {
      setSuggestLoading(false)
    }
  }

  async function handleBrief() {
    setBriefLoading(true)
    setBriefResult(null)
    try {
      const res = await postJson('/api/demo/brief', {})
      invalidateCache('/api/demo')
      const data = await res.json().catch(() => ({}))
      setBriefResult(data)
    } catch {
      setBriefResult({ error: 'Failed to get brief.' })
    } finally {
      setBriefLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Community</Heading>
        <div className="flex gap-2">
          <Button onClick={() => { setShowShareDialog(true); setSharePayload('') }}>Share Trace</Button>
          <Button onClick={() => { setShowSuggestDialog(true); setSuggestPayload('') }}>Suggest</Button>
          <Button outline onClick={handleBrief} disabled={briefLoading}>
            {briefLoading ? 'Loading...' : 'Get Brief'}
          </Button>
        </div>
      </div>

      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
          messageType === 'success'
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
        }`}>
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Stats Cards */}
      {!loading && stats && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Object.entries(stats).map(([key, val]) => (
            <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {typeof val === 'number' ? val : String(val)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Shared Traces Table */}
      {!loading && traces && traces.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Shared Traces</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Task Label</TableHeader>
                <TableHeader>Objective</TableHeader>
                <TableHeader>Risk Score</TableHeader>
                <TableHeader>Steps</TableHeader>
                <TableHeader>Tags</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {traces.map((trace, idx) => (
                <TableRow key={trace.id || idx}>
                  <TableCell className="font-medium">{trace.taskLabel || trace.name || '--'}</TableCell>
                  <TableCell className="text-zinc-500">{trace.objective || '--'}</TableCell>
                  <TableCell>
                    <Badge color={riskColor(trace.riskScore || trace.risk)}>
                      {trace.riskScore ?? trace.risk ?? '--'}
                    </Badge>
                  </TableCell>
                  <TableCell>{trace.stepCount ?? trace.steps ?? '--'}</TableCell>
                  <TableCell>
                    {Array.isArray(trace.tags) ? (
                      <div className="flex flex-wrap gap-1">
                        {trace.tags.map((tag) => (
                          <Badge key={tag} color="zinc">{tag}</Badge>
                        ))}
                      </div>
                    ) : '--'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && traces && traces.length === 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No shared traces yet</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Community-shared traces will appear here.</p>
        </div>
      )}

      {/* Brief Result */}
      {briefResult && (
        <>
          <Divider className="my-6" />
          <Subheading>Community Brief</Subheading>
          <pre className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            {briefResult.error || (typeof briefResult === 'string' ? briefResult : JSON.stringify(briefResult, null, 2))}
          </pre>
        </>
      )}

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onClose={() => setShowShareDialog(false)} size="sm">
        <DialogTitle>Share Trace</DialogTitle>
        <DialogDescription>Share a trace with the community. Provide trace data as JSON.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Trace Data (JSON)</Label>
            <Textarea rows={4} value={sharePayload} onChange={(e) => setSharePayload(e.target.value)} placeholder='{"traceId": "...", "label": "..."}' />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowShareDialog(false)}>Cancel</Button>
          <Button disabled={shareLoading} onClick={handleShare}>
            {shareLoading ? 'Sharing...' : 'Share'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Suggest Dialog */}
      <Dialog open={showSuggestDialog} onClose={() => setShowSuggestDialog(false)} size="sm">
        <DialogTitle>Submit Suggestion</DialogTitle>
        <DialogDescription>Suggest an improvement or share feedback with the community.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Suggestion (JSON)</Label>
            <Textarea rows={4} value={suggestPayload} onChange={(e) => setSuggestPayload(e.target.value)} placeholder='{"suggestion": "...", "category": "..."}' />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowSuggestDialog(false)}>Cancel</Button>
          <Button disabled={suggestLoading} onClick={handleSuggest}>
            {suggestLoading ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
