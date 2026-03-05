'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Fields'
import { Logo } from '@/components/Logo'
import { SlimLayout } from '@/components/SlimLayout'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const justRegistered = searchParams.get('registered') === 'true'
  const justReset = searchParams.get('reset') === 'true'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: email, password }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          router.push('/')
          return
        }
      }

      if (res.status === 401) {
        setError('Invalid username or password')
      } else if (res.status === 403) {
        try {
          const data = await res.json()
          setError(data.message || 'Account locked')
        } catch {
          setError('Account locked')
        }
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
        Sign in to your account
      </h2>
      <p className="mt-2 text-sm text-zinc-700">
        Don't have an account?{' '}
        <Link href="/register" className="font-medium text-orange-600 hover:underline">
          Sign up
        </Link>{' '}
        for a free trial.
      </p>

      {justRegistered && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Account created successfully. Please sign in.
        </div>
      )}

      {justReset && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Password reset successfully. Please sign in with your new password.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

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
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <Link href="/forgot-password" className="text-sm font-medium text-orange-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <div>
          <Button type="submit" variant="solid" color="orange" className="w-full" disabled={loading}>
            <span>
              {loading ? 'Signing in...' : (
                <>Sign in <span aria-hidden="true">&rarr;</span></>
              )}
            </span>
          </Button>
        </div>
      </form>
    </SlimLayout>
  )
}

export default function Login() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><p className="text-sm text-zinc-500">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  )
}
