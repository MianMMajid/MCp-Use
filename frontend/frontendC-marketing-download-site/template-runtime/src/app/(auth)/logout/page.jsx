'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { SlimLayout } from '@/components/SlimLayout'

export default function Logout() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function performLogout() {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
        })
        if (!cancelled) {
          router.push('/login')
        }
      } catch {
        if (!cancelled) {
          setError('Unable to sign out. Please try again.')
        }
      }
    }

    performLogout()
    return () => { cancelled = true }
  }, [router])

  if (error) {
    return (
      <SlimLayout>
        <div className="flex">
          <Link href="/" aria-label="Home">
            <Logo className="h-10 w-auto" />
          </Link>
        </div>
        <div className="mt-20 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
        <p className="mt-4 text-sm text-zinc-600">
          <Link href="/" className="font-medium text-orange-600 hover:underline">
            Return home
          </Link>
        </p>
      </SlimLayout>
    )
  }

  return (
    <SlimLayout>
      <div className="flex">
        <Link href="/" aria-label="Home">
          <Logo className="h-10 w-auto" />
        </Link>
      </div>
      <p className="mt-20 text-sm text-zinc-500">Signing out...</p>
    </SlimLayout>
  )
}
