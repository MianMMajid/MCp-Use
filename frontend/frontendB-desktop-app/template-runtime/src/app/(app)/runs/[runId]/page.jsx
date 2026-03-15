'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ExecutionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const runId = String(params?.runId || '').trim()

  useEffect(() => {
    if (runId) {
      router.replace(`/?mode=orchestration&executionId=${encodeURIComponent(runId)}&panel=timeline`)
      return
    }
    router.replace('/?mode=orchestration&panel=timeline')
  }, [router, runId])

  return null
}
