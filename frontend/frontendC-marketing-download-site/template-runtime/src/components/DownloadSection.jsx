'use client'

import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'

function detectOS() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'win'
  return 'unknown'
}

export function DownloadSection() {
  const [version, setVersion] = useState(null)
  const [os, setOS] = useState('unknown')
  const [downloadError, setDownloadError] = useState(false)
  const [releasesUrl, setReleasesUrl] = useState(
    'https://github.com/MianMMajid/MCp-Use/releases',
  )

  useEffect(() => {
    setOS(detectOS())
    fetch('/api/downloads/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.version) setVersion(data.version)
        if (data?.releases_url) setReleasesUrl(data.releases_url)
      })
      .catch(() => { setDownloadError(true) })
  }, [])

  const versionLabel = version ? ` ${version}` : ''

  return (
    <section id="download" className="py-20 sm:py-24">
      <Container className="rounded-3xl bg-zinc-50 p-8 ring-1 ring-zinc-900/5 sm:p-12">
        <h3 className="font-display text-2xl tracking-tight text-zinc-900">
          Download Mayple Desktop
        </h3>
        <p className="mt-3 max-w-2xl text-sm text-zinc-700">
          Run and monitor agent workflows with built-in policy checks and audit
          history.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {os !== 'win' ? (
            <>
              <Button external href="/api/downloads/mac">
                Download for macOS{versionLabel}
              </Button>
              <Button external href="/api/downloads/win" variant="outline">
                Download for Windows{versionLabel}
              </Button>
            </>
          ) : (
            <>
              <Button external href="/api/downloads/win">
                Download for Windows{versionLabel}
              </Button>
              <Button external href="/api/downloads/mac" variant="outline">
                Download for macOS{versionLabel}
              </Button>
            </>
          )}
          <Button href="/login" variant="outline">
            Open dashboard
          </Button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Requires macOS 12+ or Windows 10+ &middot;{' '}
          <a
            href={releasesUrl}
            className="underline hover:text-zinc-700"
          >
            All releases
          </a>
          {downloadError && (
            <span className="ml-2 text-amber-600">
              (Version info unavailable — downloads may still work)
            </span>
          )}
        </p>
      </Container>
    </section>
  )
}
