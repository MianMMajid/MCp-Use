'use client'

import { useState } from 'react'
import clsx from 'clsx'

import { Container } from '@/components/Container'
import { ScrollReveal } from '@/components/ScrollReveal'

const faqs = [
  {
    question: 'What does Mayple do?',
    answer:
      'Mayple is a runtime firewall for AI agent tool calls. It intercepts every action your agents take - emails, API calls, database queries - and checks it against your policies before execution. Unlike observability tools that report damage after the fact, Mayple prevents it.',
  },
  {
    question: 'Does it work with my existing agents?',
    answer:
      'Yes. Mayple is provider-agnostic and MCP-native. It works with OpenAI, Anthropic, Google, or any custom framework as a proxy layer - zero code changes required to your agents.',
  },
  {
    question: 'Do I need to write code to set up policies?',
    answer:
      'No. Policies are written in plain language through a no-code interface. For example: "Block outbound data transfers" or "Require approval before posting to Slack." You can scope rules per user, per agent, or organization-wide.',
  },
  {
    question: 'How do blocks and approvals work?',
    answer:
      'Blocked actions are stopped immediately - they never execute. Approval rules pause the action and notify a human reviewer with full context. The agent waits until the reviewer approves or rejects. Every decision is logged for audit.',
  },
  {
    question: 'How quickly can I get started?',
    answer:
      'Under ten minutes. Download the desktop app, connect your agents, and set your first rules. No infrastructure to provision. Available on macOS and Windows with cloud-hosted or self-hosted options.',
  },
]

function PlusMinusIcon({ open }) {
  return (
    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      {/* Horizontal bar (always visible) */}
      <span className="absolute h-0.5 w-4 rounded-full bg-zinc-500 transition-colors duration-200 group-hover:bg-orange-500" />
      {/* Vertical bar (rotates to 0 when open) */}
      <span
        className={clsx(
          'absolute h-4 w-0.5 rounded-full bg-zinc-500 transition-all duration-300 group-hover:bg-orange-500',
          open ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100',
        )}
      />
    </div>
  )
}

function FaqItem({ faq, isOpen, onToggle }) {
  return (
    <div className="py-6">
      <dt>
        <button
          type="button"
          onClick={onToggle}
          className="group flex w-full items-center justify-between text-left"
        >
          <span className="font-display text-base font-semibold text-zinc-900 transition-colors duration-200 group-hover:text-orange-600">
            {faq.question}
          </span>
          <span className="ml-6">
            <PlusMinusIcon open={isOpen} />
          </span>
        </button>
      </dt>
      <dd
        className={clsx(
          'grid transition-all duration-300 ease-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <p className="pt-4 pr-12 text-sm leading-relaxed text-zinc-600">
            {faq.answer}
          </p>
        </div>
      </dd>
    </div>
  )
}

export function Faqs() {
  const [openIndex, setOpenIndex] = useState(null)

  function toggle(i) {
    setOpenIndex(openIndex === i ? null : i)
  }

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="relative overflow-hidden bg-white py-20 sm:py-32"
    >
      <Container className="relative">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="faq-title"
              className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl"
            >
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg tracking-tight text-zinc-700">
              If you can&apos;t find what you&apos;re looking for, email our
              support team at{' '}
              <a href="mailto:support@mayple.cloud" className="text-orange-600 hover:text-orange-500 transition-colors duration-200">
                support@mayple.cloud
              </a>.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal>
          <dl className="mx-auto mt-12 max-w-3xl divide-y divide-zinc-200">
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
                faq={faq}
                isOpen={openIndex === i}
                onToggle={() => toggle(i)}
              />
            ))}
          </dl>
        </ScrollReveal>
      </Container>
    </section>
  )
}
