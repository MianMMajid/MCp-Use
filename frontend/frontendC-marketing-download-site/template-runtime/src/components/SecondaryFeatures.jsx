'use client'

import { useId } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'

import { Container } from '@/components/Container'

const features = [
  {
    name: 'Trace history',
    summary: 'Clear timeline of what each agent did.',
    description:
      'Search and replay past sessions so your team can quickly understand mistakes and prove what happened.',
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
    name: 'Risk alerts',
    summary: 'Spot unusual behavior early.',
    description:
      'Mayple flags suspicious patterns in real time so operators can step in before a risky action causes damage.',
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
    name: 'Policy rules',
    summary: 'Set simple allow, block, or approval rules.',
    description:
      'Apply rules to live requests instantly, so teams can keep moving while high-risk actions get extra review.',
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
      className={clsx(className, !isActive && 'opacity-75 hover:opacity-100')}
      {...props}
    >
      <div
        className={clsx(
          'w-9 rounded-lg',
          isActive ? 'bg-orange-600' : 'bg-zinc-500',
        )}
      >
        <svg aria-hidden="true" className="h-9 w-9" fill="none">
          <feature.icon />
        </svg>
      </div>
      <h3
        className={clsx(
          'mt-6 text-sm font-medium',
          isActive ? 'text-orange-600' : 'text-zinc-600',
        )}
      >
        {feature.name}
      </h3>
      <p className="mt-2 font-display text-xl text-zinc-900">
        {feature.summary}
      </p>
      <p className="mt-4 text-sm text-zinc-600">{feature.description}</p>
    </div>
  )
}

function TraceChainPreview() {
  return (
    <div className="mx-auto w-211 overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 shadow-zinc-900/5 ring-zinc-500/10">
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

function FeaturePreview({ feature }) {
  if (feature.preview === 'trace-chain') {
    return <TraceChainPreview />
  }

  return (
    <div className="mx-auto w-211 overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 shadow-zinc-900/5 ring-zinc-500/10">
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

function FeaturesDesktop() {
  return (
    <TabGroup className="hidden lg:mt-20 lg:block">
      {({ selectedIndex }) => (
        <>
          <TabList className="grid grid-cols-3 gap-x-8">
            {features.map((feature, featureIndex) => (
              <Feature
                key={feature.summary}
                feature={{
                  ...feature,
                  name: (
                    <Tab className="data-selected:not-data-focus:outline-hidden">
                      <span className="absolute inset-0" />
                      {feature.name}
                    </Tab>
                  ),
                }}
                isActive={featureIndex === selectedIndex}
                className="relative"
              />
            ))}
          </TabList>
          <TabPanels className="relative mt-20 overflow-hidden rounded-4xl bg-zinc-200 px-14 py-16 xl:px-16">
            <div className="-mx-5 flex">
              {features.map((feature, featureIndex) => (
                <TabPanel
                  static
                  key={feature.summary}
                  className={clsx(
                    'w-full shrink-0 px-5 transition duration-500 ease-in-out data-selected:not-data-focus:outline-hidden',
                    featureIndex !== selectedIndex && 'opacity-60',
                  )}
                  style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
                  aria-hidden={featureIndex !== selectedIndex}
                >
                  <FeaturePreview feature={feature} />
                </TabPanel>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-4xl ring-1 ring-zinc-900/10 ring-inset" />
          </TabPanels>
        </>
      )}
    </TabGroup>
  )
}

export function SecondaryFeatures() {
  return (
    <section
      id="secondary-features"
      aria-label="Features for running AI agents safely"
      className="pt-20 pb-14 sm:pt-32 sm:pb-20 lg:pb-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl md:text-center">
          <h2 className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl">
            Everything you need to run agents safely.
          </h2>
          <p className="mt-4 text-lg tracking-tight text-zinc-700">
            Simple controls for visibility, approvals, and audit history in one
            workflow.
          </p>
        </div>
        <FeaturesMobile />
        <FeaturesDesktop />
      </Container>
    </section>
  )
}
