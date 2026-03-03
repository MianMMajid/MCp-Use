'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Subheading } from '@/components/heading'
import { Switch } from '@/components/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'

const CATEGORIES = [
  { key: 'approvals', label: 'Approvals', description: 'Approval requests and decisions' },
  { key: 'escalations', label: 'Escalations', description: 'Escalation triggers and resolutions' },
  { key: 'run_failures', label: 'Run Failures', description: 'Agent run errors and failures' },
  { key: 'system_alerts', label: 'System Alerts', description: 'System health and security alerts' },
]

const CHANNELS = [
  { key: 'email', label: 'Email' },
  { key: 'in_app', label: 'In-App' },
]

export default function NotificationsTab() {
  const [prefs, setPrefs] = useState({})
  const [channels, setChannels] = useState({ email: true, in_app: true })
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [prefsData, historyData] = await Promise.all([
          loadJson('/api/notifications/preferences').catch(() => null),
          loadJson('/api/notifications').catch(() => null),
        ])
        if (cancelled) return
        if (prefsData) {
          setPrefs(prefsData.categories || {})
          setChannels(prefsData.channels || { email: true, in_app: true })
        }
        const items = Array.isArray(historyData) ? historyData
          : Array.isArray(historyData?.notifications) ? historyData.notifications
          : []
        setHistory(items.slice(0, 20))
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function toggleCategory(key) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  function toggleChannel(key) {
    setChannels((c) => ({ ...c, [key]: !c[key] }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await postJson('/api/notifications/preferences', { categories: prefs, channels })
      setMessage('Preferences saved')
    } catch {
      setMessage('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkAllRead() {
    try {
      await postJson('/api/notifications/read-all', {})
      setMessage('All notifications marked as read')
      setHistory((h) => h.map((n) => ({ ...n, read: true })))
    } catch {
      setMessage('Failed to mark notifications as read')
    }
  }

  if (loading) {
    return <div className="animate-pulse space-y-4 py-4">
      <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 dark:border-sky-900 dark:bg-sky-950/40">
          <p className="text-sm text-sky-800 dark:text-sky-300">{message}</p>
        </div>
      )}

      {/* Category Preferences */}
      <div>
        <Subheading>Notification Categories</Subheading>
        <div className="mt-4 space-y-3">
          {CATEGORIES.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
                <p className="text-xs text-zinc-500">{description}</p>
              </div>
              <Switch checked={prefs[key] !== false} onChange={() => toggleCategory(key)} />
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* Channel Preferences */}
      <div>
        <Subheading>Channels</Subheading>
        <div className="mt-4 space-y-3">
          {CHANNELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
              <Switch checked={channels[key] !== false} onChange={() => toggleChannel(key)} />
            </div>
          ))}
        </div>
      </div>

      <Button disabled={saving} onClick={handleSave}>
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>

      <Divider />

      {/* Notification History */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Recent Notifications</Subheading>
          <Button plain onClick={handleMarkAllRead}>Mark all read</Button>
        </div>
        {history.length > 0 ? (
          <Table className="mt-3 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Message</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Time</TableHeader>
                <TableHeader>Read</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((n, idx) => (
                <TableRow key={n.id || idx}>
                  <TableCell className="max-w-xs truncate">{n.message || n.title || '--'}</TableCell>
                  <TableCell><Badge color={statusColor(n.type || n.category)}>{n.type || n.category || '--'}</Badge></TableCell>
                  <TableCell className="text-zinc-500">{formatDate(n.createdAt || n.timestamp)}</TableCell>
                  <TableCell>{n.read ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No notifications.</p>
        )}
      </div>
    </div>
  )
}
