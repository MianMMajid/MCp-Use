'use client'

import { useState } from 'react'
import { Logo } from '@/app/logo'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Strong, Text, TextLink } from '@/components/text'

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
    <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Reset your password</Heading>

      {submitted ? (
        <>
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
            If an account exists with that email, a password reset link has been sent.
          </div>
          <Text>
            Back to{' '}
            <TextLink href="/login">
              <Strong>Sign in</Strong>
            </TextLink>
          </Text>
        </>
      ) : (
        <>
          <Text>Enter your email and we'll send you a link to reset your password.</Text>
          <Field>
            <Label>Email</Label>
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Reset password'}
          </Button>
          <Text>
            Don't have an account?{' '}
            <TextLink href="/register">
              <Strong>Sign up</Strong>
            </TextLink>
          </Text>
        </>
      )}
    </form>
  )
}
