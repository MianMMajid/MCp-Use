'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { SkeletonRows } from '@/components/skeleton'
import { loadJson, postJson, getCached } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'

export default function AdminPolicies() {
  const _cp = getCached('/admin/api/policies')
  const _cv = getCached('/admin/api/policies/versions')
  const _hasCached = !!(_cp || _cv)
  const [policies, setPolicies] = useState(_cp || null)
  const [versions, setVersions] = useState(() => _cv ? (Array.isArray(_cv?.versions) ? _cv.versions : Array.isArray(_cv) ? _cv : []) : null)
  const [loading, setLoading] = useState(!_hasCached)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Validate dialog
  const [showValidate, setShowValidate] = useState(false)
  const [validatePayload, setValidatePayload] = useState('')
  const [validateResult, setValidateResult] = useState(null)
  const [validateLoading, setValidateLoading] = useState(false)

  function fetchData() {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [policiesData, versionsData] = await Promise.all([
          loadJson('/admin/api/policies').catch(() => null),
          loadJson('/admin/api/policies/versions').catch(() => null),
        ])
        if (cancelled) return
        setPolicies(policiesData)
        setVersions(
          Array.isArray(versionsData?.versions)
            ? versionsData.versions
            : Array.isArray(versionsData)
              ? versionsData
              : [],
        )
      } catch {
        /* handled per-call */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    const cancel = fetchData()
    return () => cancel()
  }, [])

  async function handleActivateVersion(versionId) {
    try {
      const res = await postJson(`/admin/api/policies/versions/${versionId}/activate`, {})
      if (res.ok) { setMessage('Version activated.'); setMessageType('success'); fetchData() }
      else { setMessage('Activation failed.'); setMessageType('error') }
    } catch { setMessage('Activation failed.'); setMessageType('error') }
  }

  async function handleValidate() {
    setValidateLoading(true)
    setValidateResult(null)
    try {
      let body = {}
      if (validatePayload.trim()) {
        try { body = JSON.parse(validatePayload) } catch { body = { raw: validatePayload } }
      }
      const res = await postJson('/admin/api/policies/validate', body)
      const data = await res.json().catch(() => ({}))
      setValidateResult(data)
    } catch {
      setValidateResult({ error: 'Validation failed' })
    } finally {
      setValidateLoading(false)
    }
  }

  async function handleReload() {
    try {
      const res = await postJson('/admin/api/policies/reload', {})
      if (res.ok) { setMessage('Policies reloaded.'); setMessageType('success'); fetchData() }
      else { setMessage('Reload failed.'); setMessageType('error') }
    } catch { setMessage('Reload failed.'); setMessageType('error') }
  }

  if (loading) return <div className="mt-4"><SkeletonRows /></div>

  return (
    <>
      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {/* Policies */}
      <Divider className="my-6" />
      <div className="flex items-center justify-between">
        <Subheading>Policies</Subheading>
        <div className="flex gap-2">
          <Button onClick={() => { setShowValidate(true); setValidatePayload(''); setValidateResult(null) }}>Validate</Button>
          <Button onClick={handleReload}>Reload</Button>
        </div>
      </div>
      {policies && (
        <pre className="mt-4 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
          {JSON.stringify(policies, null, 2)}
        </pre>
      )}

      {/* Policy Versions */}
      {versions && versions.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Policy Versions</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Version</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.map((v, idx) => {
                const vId = v.versionId || v.id || `v-${idx}`
                return (
                  <TableRow key={vId}>
                    <TableCell className="font-mono text-xs">{typeof vId === 'string' ? vId.substring(0, 16) : String(vId)}</TableCell>
                    <TableCell><Badge color={statusColor(v.status)}>{v.status || 'draft'}</Badge></TableCell>
                    <TableCell className="text-zinc-500">{formatDate(v.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleActivateVersion(vId)}>Activate</Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}

      {/* Validate Policy Dialog */}
      <Dialog open={showValidate} onClose={() => setShowValidate(false)} size="sm">
        <DialogTitle>Validate Policy</DialogTitle>
        <DialogDescription>Submit a policy definition to validate.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Policy (JSON)</Label>
              <Textarea rows={6} value={validatePayload} onChange={(e) => setValidatePayload(e.target.value)} placeholder='{"rules": [...]}' />
            </Field>
            {validateResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
                {JSON.stringify(validateResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowValidate(false)}>Close</Button>
          <Button disabled={validateLoading} onClick={handleValidate}>{validateLoading ? 'Validating...' : 'Validate'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
