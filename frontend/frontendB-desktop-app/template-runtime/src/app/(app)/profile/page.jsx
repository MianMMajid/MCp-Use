'use client'

import { useEffect, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Text } from '@/components/text'
import { loadJson, postJson } from '@/lib/api'

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

function getInitials(username, email) {
  const name = username || email || '?'
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [usage, setUsage] = useState(null)
  const [limits, setLimits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [profileData, usageData, limitsData] = await Promise.all([
          loadJson('/api/user/profile'),
          loadJson('/api/usage/summary').catch(() => null),
          loadJson('/api/limits').catch(() => null),
        ])
        if (cancelled) return

        setProfile(profileData?.user || null)
        setSubscription(profileData?.subscription || null)
        setUsage(usageData?.summary || null)
        setLimits(limitsData?.limits || null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleChangePassword(e) {
    e.preventDefault()
    setMessage('')

    if (newPassword.length < 8) {
      setMessage('New password must be at least 8 characters.')
      setMessageType('error')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match.')
      setMessageType('error')
      return
    }

    setSaving(true)
    try {
      const res = await postJson('/api/user/change-password', {
        currentPassword,
        newPassword,
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setMessage('Password changed successfully.')
        setMessageType('success')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setMessage(data.error || 'Could not change password.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to change password. Please try again.')
      setMessageType('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>Profile</Heading>
        <Divider className="my-10 mt-6" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <Divider className="my-10" soft />
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Profile</Heading>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable. Try refreshing the page.</p>
        </div>
      )}

      <Divider className="my-10 mt-6" />

      {/* Profile Info */}
      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Subheading>Account Information</Subheading>
          <Text>Your account details and membership information.</Text>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar
              className="size-14 bg-orange-500 text-white"
              initials={getInitials(profile?.username, profile?.email)}
              alt={profile?.username || 'User'}
            />
            <div>
              <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                {profile?.username || 'Unknown'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {profile?.email || 'No email'}
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-950 dark:text-white">Username</label>
            <Input
              className="mt-1"
              value={profile?.username || ''}
              disabled
              aria-label="Username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-950 dark:text-white">Email</label>
            <Input
              className="mt-1"
              type="email"
              value={profile?.email || ''}
              disabled
              aria-label="Email"
            />
          </div>
          <div className="flex items-center gap-4">
            <Text>
              Member since {formatDate(profile?.createdAt)}
            </Text>
            {subscription?.plan && (
              <Badge color={subscription.status === 'active' ? 'green' : 'zinc'}>
                {subscription.plan}
              </Badge>
            )}
          </div>
        </div>
      </section>

      <Divider className="my-10" soft />

      {/* Change Password */}
      <form onSubmit={handleChangePassword}>
        <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <div className="space-y-1">
            <Subheading>Change Password</Subheading>
            <Text>Update your account password. Minimum 8 characters.</Text>
          </div>
          <div className="space-y-4">
            {message && (
              <p className={`rounded-lg border px-3 py-2 text-sm ${
                messageType === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
              }`}>
                {message}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">Current Password</label>
              <Input
                className="mt-1"
                type="password"
                name="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                aria-label="Current Password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">New Password</label>
              <Input
                className="mt-1"
                type="password"
                name="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                aria-label="New Password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">Confirm New Password</label>
              <Input
                className="mt-1"
                type="password"
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                aria-label="Confirm New Password"
              />
            </div>
          </div>
        </section>

        <Divider className="my-10" soft />

        <div className="flex justify-end gap-4">
          <Button
            type="reset"
            plain
            onClick={() => {
              setCurrentPassword('')
              setNewPassword('')
              setConfirmPassword('')
              setMessage('')
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Change Password'}
          </Button>
        </div>
      </form>

      <Divider className="my-10" soft />

      {/* Usage Summary */}
      <Subheading>Usage Summary</Subheading>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {usage ? (
          Object.entries(usage).map(([key, value]) => (
            <div
              key={key}
              className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
            >
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {typeof value === 'number' ? value.toLocaleString() : String(value)}
              </p>
            </div>
          ))
        ) : (
          <div className="sm:col-span-3 rounded-2xl border border-zinc-950/10 bg-white p-5 text-center dark:border-white/10 dark:bg-zinc-900">
            <Text>Usage data is not available.</Text>
          </div>
        )}
      </div>

      <Divider className="my-10" soft />

      {/* Account Limits */}
      <Subheading>Account Limits</Subheading>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {limits ? (
          <>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Max Runs / Day</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {limits.maxRunsPerDay ?? '--'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Max Tool Calls / Day</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {limits.maxToolCallsPerDay ?? '--'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Max Concurrent Longform</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {limits.maxConcurrentLongform ?? '--'}
              </p>
            </div>
          </>
        ) : (
          <div className="sm:col-span-3 rounded-2xl border border-zinc-950/10 bg-white p-5 text-center dark:border-white/10 dark:bg-zinc-900">
            <Text>Limits data is not available.</Text>
          </div>
        )}
      </div>
    </div>
  )
}
