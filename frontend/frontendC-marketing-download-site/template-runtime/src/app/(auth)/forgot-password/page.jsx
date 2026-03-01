'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Fields'
import { Logo } from '@/components/Logo'
import { SlimLayout } from '@/components/SlimLayout'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email,
          redirectUrl: `${window.location.origin}/reset-password`,
        }),
      })
    } catch {
      // Silently handle - always show success message
    } finally {
      setLoading(false)
      setSubmitted(true)
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
        Reset your password
      </h2>

      {submitted ? (
        <>
          <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
            If an account exists with that email, a password reset link has been sent.
          </div>
          <p className="mt-6 text-sm text-zinc-700">
            Back to{' '}
            <Link href="/login" className="font-medium text-orange-600 hover:underline">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-zinc-700">
            Enter your email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit} className="mt-10 grid grid-cols-1 gap-y-8">
            <TextField
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <Button type="submit" variant="solid" color="orange" className="w-full" disabled={loading}>
                <span>
                  {loading ? 'Sending...' : (
                    <>Reset password <span aria-hidden="true">&rarr;</span></>
                  )}
                </span>
              </Button>
            </div>
          </form>
          <p className="mt-6 text-sm text-zinc-700">
            Don't have an account?{' '}
            <Link href="/register" className="font-medium text-orange-600 hover:underline">
              Sign up
            </Link>
          </p>
        </>
      )}
    </SlimLayout>
  )
}
