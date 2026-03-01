'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Field, FieldGroup, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { useState } from 'react'
import { postJson } from '@/lib/api'

export function DecisionDialog({ traceId, ...props }) {
  const [isOpen, setIsOpen] = useState(false)
  const [action, setAction] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!action) return
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const res = await postJson('/api/hitl/approvals/decision', {
        traceId,
        action,
        reason,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `Request failed with status ${res.status}`)
      }
      setResult('Decision submitted successfully.')
      setTimeout(() => {
        setIsOpen(false)
        setResult(null)
        setAction('')
        setReason('')
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)} {...props} />
      <Dialog open={isOpen} onClose={setIsOpen}>
        <DialogTitle>Submit Decision</DialogTitle>
        <DialogDescription>
          Review this approval request and submit your decision. The agent will proceed based on your choice.
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>Action</Label>
              <Select name="action" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="" disabled>
                  Select a decision&hellip;
                </option>
                <option value="allow">Allow</option>
                <option value="block">Block</option>
              </Select>
            </Field>
            <Field>
              <Label>Reason</Label>
              <Textarea
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional: provide a reason for your decision..."
                rows={3}
              />
            </Field>
          </FieldGroup>

          {result && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/40">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{result}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Failed to submit decision</p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button color="orange" onClick={handleSubmit} disabled={!action || submitting}>
            {submitting ? 'Submitting...' : 'Submit Decision'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
