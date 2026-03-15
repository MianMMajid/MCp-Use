'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Text, TextLink } from '@/components/text'
import { Logo } from '@/app/logo'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('verifying') // verifying | success | error
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('No verification token provided.')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/verify-email/confirm', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (cancelled) return
        if (res.ok) {
          setStatus('success')
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data.error || 'Verification failed. The token may be expired or invalid.')
          setStatus('error')
        }
      } catch {
        if (!cancelled) {
          setError('Verification failed. Please try again.')
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 self-start" />
      <Heading>Email Verification</Heading>

      {status === 'verifying' && (
        <div className="rounded-md bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
          Verifying your email address...
        </div>
      )}

      {status === 'success' && (
        <>
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
            Your email has been verified successfully!
          </div>
          <Button href="/login" className="w-full">
            Continue to Login
          </Button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
          <Text>
            <TextLink href="/login">Back to Login</TextLink>
          </Text>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="grid w-full max-w-sm grid-cols-1 gap-8">
          <div className="h-6 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-12 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
