'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Fields'
import { Logo } from '@/components/Logo'
import { SlimLayout } from '@/components/SlimLayout'

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
    <SlimLayout>
      <div className="flex">
        <Link href="/" aria-label="Home">
          <Logo className="h-10 w-auto" />
        </Link>
      </div>
      <h2 className="mt-20 text-lg font-semibold text-zinc-900">
        Set a new password
      </h2>

      {!tokenValid && (
        <div className="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          This reset link appears to be invalid or expired.{' '}
          <Link href="/forgot-password" className="font-medium text-orange-600 hover:underline">
            Request a new one
          </Link>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-10 grid grid-cols-1 gap-y-8">
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <TextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <div>
          <Button type="submit" variant="solid" color="orange" className="w-full" disabled={loading || !tokenValid}>
            <span>
              {loading ? 'Resetting...' : (
                <>Reset password <span aria-hidden="true">&rarr;</span></>
              )}
            </span>
          </Button>
        </div>
      </form>
      <p className="mt-6 text-sm text-zinc-700">
        Remember your password?{' '}
        <Link href="/login" className="font-medium text-orange-600 hover:underline">
          Sign in
        </Link>
      </p>
    </SlimLayout>
  )
}

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
