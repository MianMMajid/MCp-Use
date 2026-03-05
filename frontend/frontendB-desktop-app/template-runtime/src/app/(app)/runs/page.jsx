'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RunsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/?mode=orchestration')
  }, [router])

  return null
}
