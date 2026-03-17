'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { TypedFirewall } from '@/components/TypedFirewall'

function useDetectedOS() {
  const [os, setOS] = useState('unknown')
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad')) setOS('mac')
    else if (ua.includes('win')) setOS('win')
    else if (ua.includes('linux') || ua.includes('android')) setOS('linux')
    else setOS('unknown')
  }, [])
  return os
}

function AppleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function WindowsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zM21 12.5v8l-9.5-1.3V12.5H21z"/>
    </svg>
  )
}

function AmbientGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Top-right warm glow */}
      <div
        className="absolute -top-24 -right-24 h-[700px] w-[700px] rounded-full opacity-[0.18]"
        style={{
          background:
            'radial-gradient(circle, var(--color-orange-200) 0%, transparent 70%)',
        }}
      />
      {/* Bottom-left amber glow */}
      <div
        className="absolute -bottom-32 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.12]"
        style={{
          background:
            'radial-gradient(circle, var(--color-amber-200) 0%, transparent 70%)',
        }}
      />
      {/* Center subtle wash */}
      <div
        className="absolute top-1/2 left-1/2 h-[800px] w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.05]"
        style={{
          background:
            'radial-gradient(ellipse, var(--color-orange-100) 0%, transparent 60%)',
        }}
      />
      {/* Bottom fade into next section */}
      <div
        className="absolute right-0 bottom-0 left-0 h-32"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--color-orange-50))',
        }}
      />
    </div>
  )
}

export function Hero() {
  const os = useDetectedOS()

  const downloadHref = os === 'win' ? '/api/downloads/win' : '/api/downloads/mac'
  const downloadLabel = os === 'win'
    ? 'Download for Windows'
    : os === 'mac'
      ? 'Download for macOS'
      : 'Download Desktop App'
  const DownloadIcon = os === 'win' ? WindowsIcon : AppleIcon
  const altHref = os === 'win' ? '/api/downloads/mac' : '/api/downloads/win'
  const altLabel = os === 'win' ? 'macOS' : 'Windows'

  return (
    <div className="grain relative flex min-h-[calc(100dvh-7.5rem)] items-center overflow-hidden bg-gradient-to-b from-white to-orange-50/40">
      <AmbientGlow />
      <Container className="relative z-10 py-16 text-center sm:py-20">
        <h1
          className="animate-fade-in-up mx-auto max-w-4xl font-display text-4xl font-normal tracking-tight text-zinc-900 sm:text-5xl lg:text-7xl"
          style={{ animationDelay: '0.1s' }}
        >
          The{' '}
          <TypedFirewall />{' '}
          for AI agent tool calls.
        </h1>
        <p
          className="animate-fade-in-up mx-auto mt-6 max-w-2xl text-lg tracking-tight text-zinc-500 sm:text-xl"
          style={{ animationDelay: '0.25s' }}
        >
          One security layer across every agent and provider. No-code rules your
          ops team can manage — no engineering tickets required.
        </p>
        <div
          className="animate-fade-in-up mt-12 flex flex-wrap justify-center gap-x-5 gap-y-4"
          style={{ animationDelay: '0.4s' }}
        >
          <Button href="/register" color="orange" className="!px-7 !py-3 !text-base shadow-lg shadow-orange-600/20">
            Get started free
          </Button>
          <Button external href={downloadHref} variant="outline" className="!px-7 !py-3 !text-base inline-flex items-center gap-2">
            <DownloadIcon className="h-5 w-5" />
            {downloadLabel}
          </Button>
        </div>
        <p
          className="animate-fade-in-up mt-4 text-sm text-zinc-400"
          style={{ animationDelay: '0.55s' }}
        >
          Also available for{' '}
          <a href={altHref} className="underline hover:text-zinc-600">{altLabel}</a>
          {' '}&middot;{' '}
          <a href="#journey" className="underline hover:text-zinc-600">See how it works</a>
        </p>
      </Container>
    </div>
  )
}
