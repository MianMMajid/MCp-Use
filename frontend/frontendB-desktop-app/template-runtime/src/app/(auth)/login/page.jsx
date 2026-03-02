'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Logo } from '@/app/logo'
import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Strong, Text, TextLink } from '@/components/text'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/google/client-id', { credentials: 'same-origin' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.configured) setGoogleConfigured(true) })
      .catch(() => {})
  }, [])

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl
          return
        }
        if (data.authenticated) {
          router.push('/')
          return
        }
      }
      setError('Google sign-in failed. Please try again.')
    } catch {
      setError('Unable to connect. Please check your network and try again.')
    } finally {
      setGoogleLoading(false)
    }
  }

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
      } else if (res.status === 429) {
        setError('Too many login attempts. Please try again later.')
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
      <Heading>Sign in to your account</Heading>

      {justRegistered && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Account created successfully. Please sign in.
        </div>
      )}

      {justReset && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Password reset successfully. Please sign in with your new password.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      <Field>
        <Label>Username or Email</Label>
        <Input
          type="text"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field>
        <Label>Password</Label>
        <Input
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <div className="flex items-center justify-between">
        <CheckboxField>
          <Checkbox name="remember" />
          <Label>Remember me</Label>
        </CheckboxField>
        <Text>
          <TextLink href="/forgot-password">
            <Strong>Forgot password?</Strong>
          </TextLink>
        </Text>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in...' : 'Login'}
      </Button>
      {googleConfigured && (
        <Button type="button" outline className="w-full" disabled={googleLoading} onClick={handleGoogleSignIn}>
          {googleLoading ? 'Redirecting...' : 'Sign in with Google'}
        </Button>
      )}
      <Text>
        Don{"'"}t have an account?{' '}
        <TextLink href="/register">
          <Strong>Sign up</Strong>
        </TextLink>
      </Text>
    </form>
  )
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
