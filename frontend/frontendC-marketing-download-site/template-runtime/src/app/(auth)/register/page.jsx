'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/Button'
import { SelectField, TextField } from '@/components/Fields'
import { Logo } from '@/components/Logo'
import { SlimLayout } from '@/components/SlimLayout'

export default function Register() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralSource, setReferralSource] = useState('Search engine')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: email, password, firstName, lastName, referralSource }),
      })

      if (res.ok) {
        router.push('/login?registered=true')
        return
      }

      if (res.status === 409) {
        setError('An account with this email already exists.')
      } else if (res.status === 403) {
        setError('Sign-up is currently disabled. Please contact support.')
      } else if (res.status === 400) {
        try {
          const data = await res.json()
          setError(data.message || 'Invalid registration data. Please check your inputs.')
        } catch {
          setError('Invalid registration data. Please check your inputs.')
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
        Get started for free
      </h2>
      <p className="mt-2 text-sm text-zinc-700">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-orange-600 hover:underline">
          Sign in
        </Link>{' '}
        to your account.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2"
      >
        <TextField
          label="First name"
          name="first_name"
          type="text"
          autoComplete="given-name"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <TextField
          label="Last name"
          name="last_name"
          type="text"
          autoComplete="family-name"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <TextField
          className="col-span-full"
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          className="col-span-full"
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <SelectField
          className="col-span-full"
          label="How did you hear about us?"
          name="referral_source"
          value={referralSource}
          onChange={(e) => setReferralSource(e.target.value)}
        >
          <option>Search engine</option>
          <option>GitHub</option>
          <option>Colleague/Word of mouth</option>
          <option>Social media</option>
          <option>Conference/Event</option>
          <option>Other</option>
        </SelectField>
        <div className="col-span-full">
          <Button type="submit" variant="solid" color="orange" className="w-full" disabled={loading}>
            <span>
              {loading ? 'Creating account...' : (
                <>Sign up <span aria-hidden="true">&rarr;</span></>
              )}
            </span>
          </Button>
        </div>
      </form>
    </SlimLayout>
  )
}
