'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Logo } from '@/app/logo'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Strong, Text, TextLink } from '@/components/text'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const tokenValid = token.length >= 16

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!tokenValid) {
      setError('Invalid or expired reset link. Please request a new one.')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, newPassword }),
      })

      if (res.ok) {
        router.push('/login?reset=true')
        return
      }

      if (res.status === 400) {
        try {
          const data = await res.json()
          setError(data.message || 'Invalid or expired reset token.')
        } catch {
          setError('Invalid or expired reset token.')
        }
      } else if (res.status === 404) {
        setError('Invalid or expired reset link. Please request a new one.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } catch {
      setError('Unable to connect. Please check your network and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Set a new password</Heading>

      {!tokenValid && (
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          This reset link appears to be invalid or expired.{' '}
          <TextLink href="/forgot-password">
            <Strong>Request a new one</Strong>
          </TextLink>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      <Field>
        <Label>New password</Label>
        <Input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </Field>
      <Field>
        <Label>Confirm password</Label>
        <Input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={loading || !tokenValid}>
        {loading ? 'Resetting...' : 'Reset password'}
      </Button>
      <Text>
        Remember your password?{' '}
        <TextLink href="/login">
          <Strong>Sign in</Strong>
        </TextLink>
      </Text>
    </form>
  )
}

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
